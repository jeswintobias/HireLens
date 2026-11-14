import prisma from "../../config/prisma/prisma.js";
import type { Pagination } from "../../helpers/hiring/requestValidation.js";
import {
  filenameFromS3Key,
  getResumeExtension,
} from "../../helpers/hiring/resumeFileTypes.js";
import type {
  Actor,
  OpeningListItem,
  PaginatedResult,
  VendorOpeningDetail,
} from "../../types/hiring.js";
import { HttpError } from "../../utils/errors/httpError.js";
import { displayNameOf, getDisplayNames } from "../hiring/userDirectoryService.js";

/**
 * IT Vendor view of openings.
 * Every query is filtered by the caller's tenant; a vendor only ever sees
 * their own uploaded profiles.
 */

const openingListSelect = {
  id: true,
  title: true,
  location: true,
  contractType: true,
  postedDate: true,
  status: true,
  experienceMin: true,
  experienceMax: true,
  hiringManagerId: true,
} as const;

export function formatExperienceRange(min: number, max: number | null) {
  return max === null ? `${min}+ years` : `${min}-${max} years`;
}

/** Vendors browse openings that are accepting submissions. */
export async function listOpenings(
  actor: Actor,
  { page, limit, skip }: Pagination
): Promise<PaginatedResult<OpeningListItem>> {
  const where = { tenantId: actor.tenantId, status: "OPEN" as const };

  const [total, rows] = await prisma.$transaction([
    prisma.opening.count({ where }),
    prisma.opening.findMany({
      where,
      select: openingListSelect,
      orderBy: [{ postedDate: "desc" }, { id: "asc" }],
      skip,
      take: limit,
    }),
  ]);

  const names = await getDisplayNames(
    actor.tenantId,
    rows.map((r) => r.hiringManagerId)
  );

  return {
    data: rows.map(({ hiringManagerId, ...r }) => ({
      ...r,
      hiringManagerName: displayNameOf(names, hiringManagerId),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getOpeningDetail(
  actor: Actor,
  openingId: string
): Promise<VendorOpeningDetail> {
  const opening = await prisma.opening.findFirst({
    where: { id: openingId, tenantId: actor.tenantId },
    select: {
      ...openingListSelect,
      description: true,
      expectedCompletionDate: true,
      hiringProfiles: {
        where: { uploadedBy: actor.userId, isDeleted: false },
        select: { id: true, s3Key: true, status: true, submittedAt: true },
        orderBy: { submittedAt: "desc" },
      },
    },
  });

  if (!opening) throw HttpError.notFound("Opening not found");

  const { hiringManagerId, hiringProfiles, ...rest } = opening;
  const names = await getDisplayNames(actor.tenantId, [hiringManagerId]);

  return {
    ...rest,
    hiringManagerName: displayNameOf(names, hiringManagerId),
    experienceRange: formatExperienceRange(rest.experienceMin, rest.experienceMax),
    profilesCount: hiringProfiles.length,
    profiles: hiringProfiles.map((p) => ({
      id: p.id,
      fileName: filenameFromS3Key(p.s3Key),
      fileType: getResumeExtension(p.s3Key) ?? "unknown",
      status: p.status,
      submittedAt: p.submittedAt,
    })),
  };
}

/** Ensures the opening exists in the caller's tenant and accepts uploads. */
export async function assertOpeningAcceptsUploads(
  actor: Actor,
  openingId: string
) {
  const opening = await prisma.opening.findFirst({
    where: { id: openingId, tenantId: actor.tenantId },
    select: { id: true, status: true },
  });
  if (!opening) throw HttpError.notFound("Opening not found");
  if (opening.status !== "OPEN") {
    throw HttpError.conflict("Opening is not accepting profiles");
  }
}
