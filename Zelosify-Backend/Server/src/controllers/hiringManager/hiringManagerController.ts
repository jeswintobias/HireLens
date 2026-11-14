import type { Request, Response } from "express";
import { getActor } from "../../helpers/hiring/actor.js";
import {
  parseIntParam,
  parsePagination,
  parseUuidParam,
} from "../../helpers/hiring/requestValidation.js";
import {
  getManagedProfileFile,
  getOwnOpening,
  getProfileRecommendation,
  listOpeningProfiles,
  listOwnOpenings,
  rejectProfile,
  requestRecommendationRerun,
  shortlistProfile,
  type BadgeFilter,
  type ProfileFilters,
  type ProfileStatusFilter,
} from "../../services/hiringManager/hiringManagerService.js";
import { HttpError } from "../../utils/errors/httpError.js";
import { sendError } from "../../utils/handler/sendError.js";
import { pipeProfileFile } from "../vendor/profiles/vendorProfileController.js";

/**
 * Hiring Manager endpoints. Controllers parse input, call the service and
 * shape the response; ownership + tenant checks live in the service.
 */

const STATUS_FILTERS: ProfileStatusFilter[] = ["SUBMITTED", "SHORTLISTED", "REJECTED"];
const BADGE_FILTERS: BadgeFilter[] = ["RECOMMENDED", "BORDERLINE", "NOT_RECOMMENDED", "PENDING"];

function parseEnum<T extends string>(value: unknown, allowed: T[], name: string): T | undefined {
  if (value === undefined || value === "") return undefined;
  const v = String(value).toUpperCase();
  if (!allowed.includes(v as T)) {
    throw HttpError.badRequest(`${name} must be one of ${allowed.join(", ")}`);
  }
  return v as T;
}

function parseProfileFilters(query: Record<string, unknown>): ProfileFilters {
  return {
    status: parseEnum(query.status, STATUS_FILTERS, "status"),
    recommendation: parseEnum(query.recommendation, BADGE_FILTERS, "recommendation"),
  };
}

/** GET /api/v1/hiring-manager/openings?page=&limit= */
export async function getManagerOpenings(req: Request, res: Response) {
  try {
    res.json(await listOwnOpenings(getActor(req), parsePagination(req.query)));
  } catch (err) {
    sendError(res, err, "hiring_manager.openings.list_failed");
  }
}

/** GET /api/v1/hiring-manager/openings/:id */
export async function getManagerOpeningById(req: Request, res: Response) {
  try {
    const opening = await getOwnOpening(getActor(req), parseUuidParam(req.params.id, "opening id"));
    res.json({ data: opening });
  } catch (err) {
    sendError(res, err, "hiring_manager.openings.detail_failed");
  }
}

/** GET /api/v1/hiring-manager/openings/:id/profiles?page=&limit=&status=&recommendation= */
export async function getManagerOpeningProfiles(req: Request, res: Response) {
  try {
    const result = await listOpeningProfiles(
      getActor(req),
      parseUuidParam(req.params.id, "opening id"),
      parsePagination(req.query),
      parseProfileFilters(req.query)
    );
    res.json(result);
  } catch (err) {
    sendError(res, err, "hiring_manager.profiles.list_failed");
  }
}

/** POST /api/v1/hiring-manager/profiles/:id/shortlist */
export async function shortlistManagerProfile(req: Request, res: Response) {
  try {
    const { changed, profile } = await shortlistProfile(getActor(req), parseIntParam(req.params.id, "profile id"));
    res.json({ message: changed ? "Profile shortlisted" : "Profile already shortlisted", data: profile });
  } catch (err) {
    sendError(res, err, "hiring_manager.profiles.shortlist_failed");
  }
}

/** POST /api/v1/hiring-manager/profiles/:id/reject */
export async function rejectManagerProfile(req: Request, res: Response) {
  try {
    const { changed, profile } = await rejectProfile(getActor(req), parseIntParam(req.params.id, "profile id"));
    res.json({ message: changed ? "Profile rejected" : "Profile already rejected", data: profile });
  } catch (err) {
    sendError(res, err, "hiring_manager.profiles.reject_failed");
  }
}

/** GET /api/v1/hiring-manager/profiles/:id/preview */
export async function previewManagerProfile(req: Request, res: Response) {
  try {
    const file = await getManagedProfileFile(getActor(req), parseIntParam(req.params.id, "profile id"));
    pipeProfileFile(res, file, "hiring_manager.profiles.preview_stream_failed");
  } catch (err) {
    sendError(res, err, "hiring_manager.profiles.preview_failed");
  }
}

/** GET /api/v1/hiring-manager/profiles/:id/recommendation (polling) */
export async function getManagerProfileRecommendation(req: Request, res: Response) {
  try {
    res.json({ data: await getProfileRecommendation(getActor(req), parseIntParam(req.params.id, "profile id")) });
  } catch (err) {
    sendError(res, err, "hiring_manager.recommendation.status_failed");
  }
}

/** POST /api/v1/hiring-manager/profiles/:id/recommendation/rerun */
export async function rerunManagerRecommendation(req: Request, res: Response) {
  try {
    const result = await requestRecommendationRerun(getActor(req), parseIntParam(req.params.id, "profile id"));
    res.status(202).json({ message: "Recommendation queued", data: result });
  } catch (err) {
    sendError(res, err, "hiring_manager.recommendation.rerun_failed");
  }
}
