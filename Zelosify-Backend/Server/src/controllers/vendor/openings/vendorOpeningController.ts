import type { Request, Response } from "express";
import { getActor } from "../../../helpers/hiring/actor.js";
import {
  parsePagination,
  parseUuidParam,
} from "../../../helpers/hiring/requestValidation.js";
import {
  getOpeningDetail,
  listOpenings,
} from "../../../services/vendor/vendorOpeningService.js";
import { sendError } from "../../../utils/handler/sendError.js";

/**
 * IT Vendor opening endpoints. Controllers only parse input, call the
 * service and shape the HTTP response — no business logic here.
 */

/** GET /api/v1/vendor/openings?page=&limit= */
export async function getVendorOpenings(req: Request, res: Response) {
  try {
    const result = await listOpenings(getActor(req), parsePagination(req.query));
    res.json(result);
  } catch (err) {
    sendError(res, err, "vendor.openings.list_failed");
  }
}

/** GET /api/v1/vendor/openings/:id */
export async function getVendorOpeningById(req: Request, res: Response) {
  try {
    const opening = await getOpeningDetail(
      getActor(req),
      parseUuidParam(req.params.id, "opening id")
    );
    res.json({ data: opening });
  } catch (err) {
    sendError(res, err, "vendor.openings.detail_failed");
  }
}
