import { Router, type RequestHandler } from "express";
import { authenticateUser } from "../../middlewares/auth/authenticateMiddleware.js";
import { authorizeRole } from "../../middlewares/auth/authorizeMiddleware.js";
import {
  getManagerOpenings,
  getManagerOpeningById,
  getManagerOpeningProfiles,
  shortlistManagerProfile,
  rejectManagerProfile,
  previewManagerProfile,
  getManagerProfileRecommendation,
  rerunManagerRecommendation,
} from "../../controllers/controllers.js";

/**
 * Hiring Manager contract-hiring routes.
 * Every route: authenticated + HIRING_MANAGER role (API-level RBAC).
 * Ownership (opening.hiringManagerId === user.id) + tenant checks happen in
 * the service layer on every query.
 */
const openingsRouter = Router();
const profilesRouter = Router();

const managerOnly: RequestHandler[] = [
  authenticateUser as RequestHandler,
  authorizeRole("HIRING_MANAGER") as RequestHandler,
];

openingsRouter.use(...managerOnly);
profilesRouter.use(...managerOnly);

/** GET /api/v1/hiring-manager/openings?page=1&limit=10 */
openingsRouter.get("/", getManagerOpenings);

/** GET /api/v1/hiring-manager/openings/:id */
openingsRouter.get("/:id", getManagerOpeningById);

/** GET /api/v1/hiring-manager/openings/:id/profiles?status=&recommendation= */
openingsRouter.get("/:id/profiles", getManagerOpeningProfiles);

/** POST /api/v1/hiring-manager/profiles/:id/shortlist */
profilesRouter.post("/:id/shortlist", shortlistManagerProfile);

/** POST /api/v1/hiring-manager/profiles/:id/reject */
profilesRouter.post("/:id/reject", rejectManagerProfile);

/** GET /api/v1/hiring-manager/profiles/:id/preview */
profilesRouter.get("/:id/preview", previewManagerProfile);

/** GET /api/v1/hiring-manager/profiles/:id/recommendation */
profilesRouter.get("/:id/recommendation", getManagerProfileRecommendation);

/** POST /api/v1/hiring-manager/profiles/:id/recommendation/rerun */
profilesRouter.post("/:id/recommendation/rerun", rerunManagerRecommendation);

export { openingsRouter as managerOpeningRoutes, profilesRouter as managerProfileRoutes };
