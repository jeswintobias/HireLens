import { Router, type RequestHandler } from "express";
import { authenticateUser } from "../../middlewares/auth/authenticateMiddleware.js";
import { authorizeRole } from "../../middlewares/auth/authorizeMiddleware.js";
import { fetchData } from "../../controllers/controllers.js";
import { managerOpeningRoutes, managerProfileRoutes } from "./hiringManagerContractRoutes.js";

const router = Router();

/**
 * @route /hiring-manager/openings  (own contract openings + submitted profiles)
 */
router.use("/openings", managerOpeningRoutes);

/**
 * @route /hiring-manager/profiles  (shortlist / reject / preview / AI re-run)
 */
router.use("/profiles", managerProfileRoutes);

/**
 * =============================================================================
 * HIRING MANAGER ROUTES - VACANCY MANAGEMENT
 * =============================================================================
 */

/**
 * GET /api/v1/hiring-manager
 * @requires HIRING_MANAGER role
 */
router.get(
  "/",
  authenticateUser as RequestHandler,
  authorizeRole("HIRING_MANAGER") as RequestHandler,
  (async (req, res, next) => {
    try {
      await fetchData(req as any, res);
    } catch (error) {
      next(error);
    }
  }) as RequestHandler
);

export default router;
