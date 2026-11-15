import type { Readable } from "stream";
import prisma from "../../config/prisma/prisma.js";
import { sanitizeFilename } from "../../helpers/vendorRequestValidation.js";
import {
  getResumeExtension,
  getResumeMimeType,
  filenameFromS3Key,
  hasValidSignature,
} from "../../helpers/hiring/resumeFileTypes.js";
import type {
  Actor,
  ProfileUploadTokenFields,
} from "../../types/hiring.js";
import type { UploadMetadata, UploadToken } from "../../types/fileUpload.js";
import { decrypt } from "../../utils/encryption/encryption.js";
import { HttpError } from "../../utils/errors/httpError.js";
import logger from "../../utils/logger/logger.js";
import { FilePresignService } from "../upload/filePresignService.js";
import { FileUploadService } from "../upload/fileUploadService.js";
import { createStorageService } from "../storage/storageFactory.js";
import { emitProfilesSubmitted } from "../hiring/profileEvents.js";
import { assertOpeningAcceptsUploads } from "./vendorOpeningService.js";
import type { Notification } from "@prisma/client";
import { notifyProfilesSubmitted } from "../notifications/notificationService.js";
import { publishNotification } from "../notifications/notificationEvents.js";

/**
 * IT Vendor profile workflow: presign → upload/submit → soft delete → preview.
 *
 * Files never go from the browser to S3 directly. The backend issues
 * encrypted upload tokens (S3 key + presigned URL + tenant/opening/uploader),
 * then receives the files and pushes them to S3 itself after validating every
 * token. Database rows are written in a single Prisma transaction.
 */

const presignService = new FilePresignService();
const uploadService = new FileUploadService();

const UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000;

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

// -----------------------------------------------------------------------------
// Presign
// -----------------------------------------------------------------------------

export async function presignProfileUploads(
  actor: Actor,
  openingId: string,
  filenames: string[]
): Promise<UploadToken[]> {
  const invalid = filenames.filter((f) => !getResumeExtension(f));
  if (invalid.length > 0) {
    throw HttpError.badRequest("Only PDF and PPTX files are allowed", {
      invalidFiles: invalid,
    });
  }

  const sanitized = filenames.map(sanitizeFilename);
  if (new Set(sanitized).size !== sanitized.length) {
    throw HttpError.badRequest("Duplicate filenames in one request");
  }

  await assertOpeningAcceptsUploads(actor, openingId);

  const customMetadata: ProfileUploadTokenFields = {
    openingId,
    uploadedBy: actor.userId,
  };

  const tokens = await presignService.generateUploadTokens(filenames, {
    // S3 layout required by the task: <bucket>/<tenantId>/<openingId>/<timestamp>_<filename>
    s3KeyConfig: {
      pathSegments: [actor.tenantId, openingId],
      includeTimestamp: true,
    },
    tenantId: actor.tenantId,
    uploadEndpoint: `/api/v1/vendor/openings/${openingId}/profiles/upload`,
    expiryDuration: UPLOAD_TOKEN_TTL_MS,
    customMetadata,
  });

  logger.info("vendor.profiles.presigned", {
    tenantId: actor.tenantId,
    openingId,
    userId: actor.userId,
    fileCount: tokens.length,
  });
  return tokens;
}

// -----------------------------------------------------------------------------
// Upload + submit
// -----------------------------------------------------------------------------

/** Decrypts a token and checks it was issued to this user for this opening. */
function verifyUploadToken(
  token: string,
  actor: Actor,
  openingId: string
): UploadMetadata {
  let meta: UploadMetadata;
  try {
    meta = JSON.parse(decrypt(token)) as UploadMetadata;
  } catch {
    throw HttpError.badRequest("Invalid upload token");
  }

  const fields = meta.customFields as ProfileUploadTokenFields | undefined;
  const expectedPrefix = `${actor.tenantId}/${openingId}/`;

  if (Date.now() > meta.expiresAt) {
    throw HttpError.badRequest(`Upload token expired for ${meta.filename}`);
  }
  if (
    meta.tenantId !== actor.tenantId ||
    fields?.openingId !== openingId ||
    fields?.uploadedBy !== actor.userId ||
    !meta.key.startsWith(expectedPrefix)
  ) {
    // Token belongs to another user, tenant or opening.
    throw HttpError.forbidden("Upload token is not valid for this request");
  }
  return meta;
}

export async function uploadAndSubmitProfiles(
  actor: Actor,
  openingId: string,
  files: UploadedFile[],
  tokens: string[]
) {
  if (files.length === 0) {
    throw HttpError.badRequest("At least one file is required in 'files'");
  }
  if (files.length !== tokens.length) {
    throw HttpError.badRequest(
      "Each file needs exactly one upload token (same order as files)"
    );
  }

  await assertOpeningAcceptsUploads(actor, openingId);

  // 1. Validate everything before touching S3 or the database.
  const items = files.map((file, i) => {
    const meta = verifyUploadToken(tokens[i], actor, openingId);
    if (sanitizeFilename(file.originalname) !== meta.filename) {
      throw HttpError.badRequest(
        `File '${file.originalname}' does not match its upload token`
      );
    }
    const ext = getResumeExtension(file.originalname);
    if (!ext || !hasValidSignature(file.buffer, ext)) {
      throw HttpError.badRequest(
        `File '${file.originalname}' is not a valid PDF or PPTX`
      );
    }
    return { file, token: tokens[i], meta, mimeType: getResumeMimeType(file.originalname) };
  });

  const keys = items.map((it) => it.meta.key);
  if (new Set(keys).size !== keys.length) {
    throw HttpError.badRequest("The same upload token was used more than once");
  }
  const alreadyUsed = await prisma.hiringProfile.count({
    where: { s3Key: { in: keys } },
  });
  if (alreadyUsed > 0) {
    throw HttpError.conflict("Upload token has already been used");
  }

  // 2. Push files to S3 (backend-mediated). All must succeed before any DB write.
  const results = await Promise.all(
    items.map((it) =>
      uploadService.uploadFile({
        fileBuffer: it.file.buffer,
        mimeType: it.mimeType,
        uploadToken: it.token,
      })
    )
  );
  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    logger.error("vendor.profiles.storage_upload_failed", {
      tenantId: actor.tenantId,
      openingId,
      failed: failed.map((f) => f.errorMessage),
      orphanedKeys: results.filter((r) => r.success).map((r) => r.key),
    });
    throw new HttpError(502, "File storage upload failed, please retry");
  }

  // 3. Persist all profiles atomically.
  let created: { id: number; s3Key: string; status: string; submittedAt: Date }[];
  let managerNotification: Notification | undefined;
  try {
    created = await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction: the opening may have closed meanwhile.
      const opening = await tx.opening.findFirst({
        where: { id: openingId, tenantId: actor.tenantId, status: "OPEN" },
        select: { id: true, title: true, hiringManagerId: true },
      });
      if (!opening) {
        throw HttpError.conflict("Opening is not accepting profiles");
      }
      const rows = await tx.hiringProfile.createManyAndReturn({
        data: keys.map((s3Key) => ({
          openingId,
          s3Key,
          uploadedBy: actor.userId,
          status: "SUBMITTED" as const,
        })),
        select: { id: true, s3Key: true, status: true, submittedAt: true },
      });
      // Tell the opening's hiring manager (same transaction: all or nothing).
      managerNotification = await notifyProfilesSubmitted(tx, {
        tenantId: actor.tenantId,
        hiringManagerId: opening.hiringManagerId,
        openingId,
        openingTitle: opening.title,
        count: rows.length,
      });
      return rows;
    });
  } catch (error) {
    logger.error("vendor.profiles.db_write_failed", {
      tenantId: actor.tenantId,
      openingId,
      orphanedKeys: keys,
      error,
    });
    throw error;
  }

  // Committed: push the notification live to the hiring manager's open tabs.
  if (managerNotification) publishNotification(managerNotification);

  logger.info("vendor.profiles.submitted", {
    tenantId: actor.tenantId,
    openingId,
    userId: actor.userId,
    profileIds: created.map((p) => p.id),
  });

  // 4. Trigger AI recommendation asynchronously (does not delay the response).
  emitProfilesSubmitted(created.map((p) => p.id));

  return created.map((p) => ({
    id: p.id,
    fileName: filenameFromS3Key(p.s3Key),
    fileType: getResumeExtension(p.s3Key) ?? "unknown",
    status: p.status,
    submittedAt: p.submittedAt,
  }));
}

// -----------------------------------------------------------------------------
// Soft delete + preview
// -----------------------------------------------------------------------------

/** A vendor may only touch their own, non-deleted profiles in their tenant. */
function ownProfileWhere(actor: Actor, profileId: number) {
  return {
    id: profileId,
    uploadedBy: actor.userId,
    isDeleted: false,
    opening: { tenantId: actor.tenantId },
  };
}

export async function softDeleteProfile(actor: Actor, profileId: number) {
  const profile = await prisma.hiringProfile.findFirst({
    where: ownProfileWhere(actor, profileId),
    select: { id: true, status: true },
  });
  if (!profile) throw HttpError.notFound("Profile not found");
  if (profile.status !== "SUBMITTED") {
    throw HttpError.conflict(
      "Profile has already been reviewed and cannot be deleted"
    );
  }

  // Guarded update: only succeeds if the profile is still deletable.
  const { count } = await prisma.hiringProfile.updateMany({
    where: { ...ownProfileWhere(actor, profileId), status: "SUBMITTED" },
    data: { isDeleted: true },
  });
  if (count === 0) throw HttpError.conflict("Profile could not be deleted");

  logger.info("vendor.profile.soft_deleted", {
    tenantId: actor.tenantId,
    userId: actor.userId,
    profileId,
  });
}

export interface ProfileFileStream {
  stream: Readable;
  fileName: string;
  mimeType: string;
}

/** Streams a stored resume from S3 through the backend. */
export async function streamProfileFile(s3Key: string): Promise<ProfileFileStream> {
  const stream = await createStorageService().getObjectStream(s3Key);
  return {
    stream,
    fileName: filenameFromS3Key(s3Key),
    mimeType: getResumeMimeType(s3Key),
  };
}

export async function getOwnProfileFile(
  actor: Actor,
  profileId: number
): Promise<ProfileFileStream> {
  const profile = await prisma.hiringProfile.findFirst({
    where: ownProfileWhere(actor, profileId),
    select: { s3Key: true },
  });
  if (!profile) throw HttpError.notFound("Profile not found");
  return streamProfileFile(profile.s3Key);
}
