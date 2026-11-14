import type { Request, Response } from "express";
import { getActor } from "../../../helpers/hiring/actor.js";
import {
  parseIntParam,
  parsePresignBody,
  parseUploadTokens,
  parseUuidParam,
} from "../../../helpers/hiring/requestValidation.js";
import {
  getOwnProfileFile,
  presignProfileUploads,
  softDeleteProfile,
  uploadAndSubmitProfiles,
  type ProfileFileStream,
  type UploadedFile,
} from "../../../services/vendor/vendorProfileService.js";
import { sendError } from "../../../utils/handler/sendError.js";
import logger from "../../../utils/logger/logger.js";

/** POST /api/v1/vendor/openings/:id/profiles/presign  body: { filenames: string[] } */
export async function presignVendorProfiles(req: Request, res: Response) {
  try {
    const { filenames } = parsePresignBody(req.body);
    const tokens = await presignProfileUploads(
      getActor(req),
      parseUuidParam(req.params.id, "opening id"),
      filenames
    );
    res.json({ data: tokens });
  } catch (err) {
    sendError(res, err, "vendor.profiles.presign_failed");
  }
}

/**
 * POST /api/v1/vendor/openings/:id/profiles/upload
 * multipart/form-data: files[] + uploadTokens (JSON array, same order as files)
 */
export async function uploadVendorProfiles(req: Request, res: Response) {
  try {
    const profiles = await uploadAndSubmitProfiles(
      getActor(req),
      parseUuidParam(req.params.id, "opening id"),
      (req.files as UploadedFile[] | undefined) ?? [],
      parseUploadTokens(req.body?.uploadTokens)
    );
    res.status(201).json({
      message: "Profiles submitted successfully",
      data: profiles,
    });
  } catch (err) {
    sendError(res, err, "vendor.profiles.upload_failed");
  }
}

/** DELETE /api/v1/vendor/profiles/:profileId  (soft delete) */
export async function deleteVendorProfile(req: Request, res: Response) {
  try {
    await softDeleteProfile(
      getActor(req),
      parseIntParam(req.params.profileId, "profile id")
    );
    res.json({ message: "Profile deleted" });
  } catch (err) {
    sendError(res, err, "vendor.profiles.delete_failed");
  }
}

/** Pipes a resume stream to the client for inline preview. */
export function pipeProfileFile(
  res: Response,
  file: ProfileFileStream,
  event: string
) {
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${file.fileName.replace(/"/g, "")}"`
  );
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  file.stream.on("error", (error) => {
    logger.error(event, { error });
    if (!res.headersSent) res.status(502).json({ message: "File unavailable" });
    else res.destroy();
  });
  file.stream.pipe(res);
}

/** GET /api/v1/vendor/profiles/:profileId/preview */
export async function previewVendorProfile(req: Request, res: Response) {
  try {
    const file = await getOwnProfileFile(
      getActor(req),
      parseIntParam(req.params.profileId, "profile id")
    );
    pipeProfileFile(res, file, "vendor.profiles.preview_stream_failed");
  } catch (err) {
    sendError(res, err, "vendor.profiles.preview_failed");
  }
}
