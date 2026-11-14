import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma/prisma.js";
import type { Pagination } from "../../helpers/hiring/requestValidation.js";
import {
  filenameFromS3Key,
  getResumeExtension,
} from "../../helpers/hiring/resumeFileTypes.js";
import type { Actor, PaginatedResult } from "../../types/hiring.js";
import { HttpError } from "../../utils/errors/httpError.js";
import logger from "../../utils/logger/logger.js";
import { getDisplayNames, displayNameOf } from "../hiring/userDirectoryService.js";
import { recommendationQueue } from "../recommendation/recommendationQueue.js";
import { AGENT_VERSION } from "../recommendation/recommendationService.js";
import { THRESHOLDS, decide, type Decision } from "../recommendation/policy/decisionPolicy.js";
import { parseRequiredSkills } from "../recommendation/requirements/openingRequirements.js";
import { formatExperienceRange } from "../vendor/vendorOpeningService.js";
import { streamProfileFile, type ProfileFileStream } from "../vendor/vendorProfileService.js";

/**
 * Hiring Manager view of the contract hiring module.
 *
 * Ownership rule (from the task): opening.hiringManagerId === loggedInUser.id.
 * Every query filters by BOTH the caller's tenant and the caller's user id, so
 * another manager's openings — in this tenant or any other — are invisible
 * (uniform 404, nothing is leaked about their existence).
 */

export type RecommendationState = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type BadgeFilter = Decision | "PENDING";
export type ProfileStatusFilter = "SUBMITTED" | "SHORTLISTED" | "REJECTED";

export interface ProfileFilters {
  status?: ProfileStatusFilter;
  recommendation?: BadgeFilter;
}

/** Openings owned by this manager, inside this tenant. */
function ownOpeningWhere(actor: Actor): Prisma.OpeningWhereInput {
  return { tenantId: actor.tenantId, hiringManagerId: actor.userId };
}

/** A live profile that belongs to one of this manager's openings. */
function managedProfileWhere(actor: Actor, profileId: number): Prisma.hiringProfileWhereInput {
  return { id: profileId, isDeleted: false, opening: ownOpeningWhere(actor) };
}

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? null : Math.round(v * 100);

/** Badge filter → score range on the persisted (deterministic) final score. */
function badgeWhere(badge: BadgeFilter): Prisma.hiringProfileWhereInput {
  switch (badge) {
    case "RECOMMENDED":
      return { recommendedAt: { not: null }, recommendationScore: { gte: THRESHOLDS.recommended } };
    case "BORDERLINE":
      return {
        recommendedAt: { not: null },
        recommendationScore: { gte: THRESHOLDS.borderline, lt: THRESHOLDS.recommended },
      };
    case "NOT_RECOMMENDED":
      return { recommendedAt: { not: null }, recommendationScore: { lt: THRESHOLDS.borderline } };
    case "PENDING":
      return { recommendedAt: null };
  }
}

// -----------------------------------------------------------------------------
// Openings
// -----------------------------------------------------------------------------

export async function listOwnOpenings(actor: Actor, { page, limit, skip }: Pagination) {
  const where = ownOpeningWhere(actor);

  const [total, rows] = await prisma.$transaction([
    prisma.opening.count({ where }),
    prisma.opening.findMany({
      where,
      select: {
        id: true, title: true, location: true, contractType: true, postedDate: true,
        expectedCompletionDate: true, status: true, experienceMin: true, experienceMax: true,
        _count: { select: { hiringProfiles: { where: { isDeleted: false } } } },
      },
      orderBy: [{ postedDate: "desc" }, { id: "asc" }],
      skip,
      take: limit,
    }),
  ]);

  // Per-opening counts of profiles still awaiting the manager's decision.
  const pendingReview = rows.length
    ? await prisma.hiringProfile.groupBy({
        by: ["openingId"],
        where: { openingId: { in: rows.map((r) => r.id) }, isDeleted: false, status: "SUBMITTED" },
        _count: { _all: true },
      })
    : [];
  const pendingByOpening = new Map(pendingReview.map((g) => [g.openingId, g._count._all]));

  return {
    data: rows.map(({ _count, ...o }) => ({
      ...o,
      experienceRange: formatExperienceRange(o.experienceMin, o.experienceMax),
      profilesCount: _count.hiringProfiles,
      awaitingDecisionCount: pendingByOpening.get(o.id) ?? 0,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

async function getOwnOpeningOrThrow(actor: Actor, openingId: string) {
  const opening = await prisma.opening.findFirst({
    where: { id: openingId, ...ownOpeningWhere(actor) },
    select: {
      id: true, title: true, description: true, location: true, contractType: true,
      postedDate: true, expectedCompletionDate: true, status: true,
      experienceMin: true, experienceMax: true,
    },
  });
  if (!opening) throw HttpError.notFound("Opening not found");
  return opening;
}

export async function getOwnOpening(actor: Actor, openingId: string) {
  const opening = await getOwnOpeningOrThrow(actor, openingId);
  return {
    ...opening,
    experienceRange: formatExperienceRange(opening.experienceMin, opening.experienceMax),
    requiredSkills: parseRequiredSkills(opening.description),
  };
}

// -----------------------------------------------------------------------------
// Profiles
// -----------------------------------------------------------------------------

const profileSelect = {
  id: true, s3Key: true, uploadedBy: true, submittedAt: true, status: true,
  shortlistedBy: true, shortlistedAt: true, rejectedBy: true, rejectedAt: true,
  recommended: true, recommendationScore: true, recommendationConfidence: true,
  recommendationReason: true, recommendationLatencyMs: true, recommendationVersion: true,
  recommendedAt: true,
  recommendationRuns: {
    where: { version: AGENT_VERSION },
    select: {
      status: true, decision: true, injectionSuspected: true, scoreBreakdown: true,
      featureVector: true, model: true, llmCalls: true, retries: true, completedAt: true,
    },
    take: 1,
  },
} satisfies Prisma.hiringProfileSelect;

type ProfileRow = Prisma.hiringProfileGetPayload<{ select: typeof profileSelect }>;

function recommendationState(p: ProfileRow): RecommendationState {
  const run = p.recommendationRuns[0];
  if (recommendationQueue.isQueuedOrRunning(p.id) || run?.status === "RUNNING") return "PROCESSING";
  if (p.recommendedAt) return "COMPLETED";
  if (run?.status === "FAILED") return "FAILED";
  return "PENDING";
}

function toProfileCard(p: ProfileRow, names: Map<string, string>) {
  const run = p.recommendationRuns[0];
  const state = recommendationState(p);
  const hasResult = p.recommendedAt !== null && p.recommendationScore !== null;
  const features = (run?.featureVector ?? null) as Record<string, unknown> | null;
  const decidedBy = p.shortlistedBy ?? p.rejectedBy;

  return {
    id: p.id,
    fileName: filenameFromS3Key(p.s3Key),
    fileType: getResumeExtension(p.s3Key) ?? "unknown",
    uploadedAt: p.submittedAt,
    vendorName: displayNameOf(names, p.uploadedBy),
    status: p.status,
    decision: decidedBy
      ? { by: displayNameOf(names, decidedBy), at: p.shortlistedAt ?? p.rejectedAt }
      : null,
    recommendation: {
      state,
      badge: hasResult ? decide(p.recommendationScore!) : null,
      recommended: p.recommended,
      score: p.recommendationScore,
      scorePercent: pct(p.recommendationScore),
      confidence: p.recommendationConfidence,
      confidencePercent: pct(p.recommendationConfidence),
      explanation: p.recommendationReason,
      latencyMs: p.recommendationLatencyMs,
      version: p.recommendationVersion,
      recommendedAt: p.recommendedAt,
      injectionSuspected: run?.injectionSuspected ?? false,
      breakdown: hasResult ? (run?.scoreBreakdown ?? null) : null,
      matchedSkills: hasResult && Array.isArray(features?.matchedSkills) ? features!.matchedSkills : [],
      missingSkills: hasResult && Array.isArray(features?.missingSkills) ? features!.missingSkills : [],
      candidate: hasResult && features
        ? { experienceYears: features.experienceYears ?? null, location: features.location ?? null }
        : null,
    },
  };
}

export type ProfileCard = ReturnType<typeof toProfileCard>;

async function badgeSummary(openingId: string) {
  const base: Prisma.hiringProfileWhereInput = { openingId, isDeleted: false };
  const [total, recommended, borderline, notRecommended, pending, shortlisted, rejected] =
    await prisma.$transaction([
      prisma.hiringProfile.count({ where: base }),
      prisma.hiringProfile.count({ where: { ...base, ...badgeWhere("RECOMMENDED") } }),
      prisma.hiringProfile.count({ where: { ...base, ...badgeWhere("BORDERLINE") } }),
      prisma.hiringProfile.count({ where: { ...base, ...badgeWhere("NOT_RECOMMENDED") } }),
      prisma.hiringProfile.count({ where: { ...base, ...badgeWhere("PENDING") } }),
      prisma.hiringProfile.count({ where: { ...base, status: "SHORTLISTED" } }),
      prisma.hiringProfile.count({ where: { ...base, status: "REJECTED" } }),
    ]);
  return { total, recommended, borderline, notRecommended, pending, shortlisted, rejected };
}

/**
 * Profiles for one of the manager's openings, best AI score first
 * (not-yet-scored profiles last). Soft-deleted profiles are never returned.
 */
export async function listOpeningProfiles(
  actor: Actor,
  openingId: string,
  { page, limit, skip }: Pagination,
  filters: ProfileFilters = {}
): Promise<PaginatedResult<ProfileCard> & { opening: Awaited<ReturnType<typeof getOwnOpening>>; summary: Awaited<ReturnType<typeof badgeSummary>> }> {
  const opening = await getOwnOpening(actor, openingId);

  const where: Prisma.hiringProfileWhereInput = {
    openingId,
    isDeleted: false,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.recommendation ? badgeWhere(filters.recommendation) : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.hiringProfile.count({ where }),
    prisma.hiringProfile.findMany({
      where,
      select: profileSelect,
      orderBy: [
        { recommendationScore: { sort: "desc", nulls: "last" } },
        { submittedAt: "desc" },
        { id: "asc" },
      ],
      skip,
      take: limit,
    }),
  ]);

  const [summary, names] = await Promise.all([
    badgeSummary(openingId),
    getDisplayNames(
      actor.tenantId,
      rows.flatMap((r) => [r.uploadedBy, r.shortlistedBy, r.rejectedBy].filter((v): v is string => !!v))
    ),
  ]);

  return {
    opening,
    summary,
    data: rows.map((r) => toProfileCard(r, names)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

async function getManagedProfileOrThrow(actor: Actor, profileId: number) {
  const profile = await prisma.hiringProfile.findFirst({
    where: managedProfileWhere(actor, profileId),
    select: { id: true, s3Key: true, status: true, openingId: true },
  });
  if (!profile) throw HttpError.notFound("Profile not found");
  return profile;
}

async function getProfileCard(actor: Actor, profileId: number) {
  const row = await prisma.hiringProfile.findFirst({
    where: managedProfileWhere(actor, profileId),
    select: profileSelect,
  });
  if (!row) throw HttpError.notFound("Profile not found");
  const names = await getDisplayNames(
    actor.tenantId,
    [row.uploadedBy, row.shortlistedBy, row.rejectedBy].filter((v): v is string => !!v)
  );
  return toProfileCard(row, names);
}

// -----------------------------------------------------------------------------
// Shortlist / Reject
// -----------------------------------------------------------------------------

type ReviewAction = "SHORTLISTED" | "REJECTED";

/**
 * Records the manager's decision. Only SUBMITTED profiles can be decided;
 * repeating the same decision is idempotent, switching to the opposite one
 * is refused (409). The guarded updateMany makes concurrent clicks safe:
 * exactly one request wins the SUBMITTED → decided transition.
 */
async function reviewProfile(actor: Actor, profileId: number, action: ReviewAction) {
  const profile = await getManagedProfileOrThrow(actor, profileId);

  if (profile.status === action) {
    return { changed: false, profile: await getProfileCard(actor, profileId) };
  }
  if (profile.status !== "SUBMITTED") {
    throw HttpError.conflict(`Profile has already been ${profile.status.toLowerCase()}`);
  }

  const now = new Date();
  const data: Prisma.hiringProfileUpdateManyMutationInput =
    action === "SHORTLISTED"
      ? { status: "SHORTLISTED", shortlistedBy: actor.userId, shortlistedAt: now }
      : { status: "REJECTED", rejectedBy: actor.userId, rejectedAt: now };

  const { count } = await prisma.hiringProfile.updateMany({
    where: { ...managedProfileWhere(actor, profileId), status: "SUBMITTED" },
    data,
  });

  if (count === 0) {
    // Lost a race (another request decided it, or it was deleted meanwhile).
    const current = await prisma.hiringProfile.findFirst({
      where: managedProfileWhere(actor, profileId),
      select: { status: true },
    });
    if (!current) throw HttpError.notFound("Profile not found");
    if (current.status === action) return { changed: false, profile: await getProfileCard(actor, profileId) };
    throw HttpError.conflict(`Profile has already been ${current.status.toLowerCase()}`);
  }

  logger.info("hiring_manager.profile.reviewed", {
    tenantId: actor.tenantId,
    userId: actor.userId,
    openingId: profile.openingId,
    profileId,
    action,
  });
  return { changed: true, profile: await getProfileCard(actor, profileId) };
}

export const shortlistProfile = (actor: Actor, profileId: number) =>
  reviewProfile(actor, profileId, "SHORTLISTED");

export const rejectProfile = (actor: Actor, profileId: number) =>
  reviewProfile(actor, profileId, "REJECTED");

// -----------------------------------------------------------------------------
// Preview + AI re-run
// -----------------------------------------------------------------------------

export async function getManagedProfileFile(actor: Actor, profileId: number): Promise<ProfileFileStream> {
  const profile = await getManagedProfileOrThrow(actor, profileId);
  return streamProfileFile(profile.s3Key);
}

/**
 * Queues a fresh AI recommendation for a profile (e.g. after a failure).
 * Runs asynchronously; the queue de-duplicates repeated clicks.
 */
export async function requestRecommendationRerun(actor: Actor, profileId: number) {
  const profile = await getManagedProfileOrThrow(actor, profileId);
  const alreadyQueued = recommendationQueue.isQueuedOrRunning(profile.id);
  if (!alreadyQueued) {
    recommendationQueue.enqueue([profile.id], { force: true, trigger: "manual_rerun" });
  }
  logger.info("hiring_manager.recommendation.rerun_requested", {
    tenantId: actor.tenantId,
    userId: actor.userId,
    profileId,
    alreadyQueued,
  });
  return { profileId, state: "PROCESSING" as const, alreadyQueued };
}

/** Lightweight status for polling while a recommendation is running. */
export async function getProfileRecommendation(actor: Actor, profileId: number) {
  const card = await getProfileCard(actor, profileId);
  return { id: card.id, status: card.status, recommendation: card.recommendation };
}
