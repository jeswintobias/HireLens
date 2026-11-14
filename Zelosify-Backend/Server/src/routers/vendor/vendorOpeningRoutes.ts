import { Router, type RequestHandler } from "express";
import { authenticateUser } from "../../middlewares/auth/authenticateMiddleware.js";
import { authorizeRole } from "../../middlewares/auth/authorizeMiddleware.js";
import { resumeFilesUpload } from "../../config/multer/resumeUploadConfig.js";
import {
  getVendorOpenings,
  getVendorOpeningById,
  presignVendorProfiles,
  uploadVendorProfiles,
  deleteVendorProfile,
  previewVendorProfile,
} from "../../controllers/controllers.js";

/**
 * IT Vendor contract-hiring routes.
 * Every route: authenticated + IT_VENDOR role (API-level RBAC).
 * Tenant filtering and ownership checks happen in the service layer.
 */
const openingsRouter = Router();
const profilesRouter = Router();

const vendorOnly: RequestHandler[] = [
  authenticateUser as RequestHandler,
  authorizeRole("IT_VENDOR") as RequestHandler,
];

openingsRouter.use(...vendorOnly);
profilesRouter.use(...vendorOnly);

/** GET /api/v1/vendor/openings?page=1&limit=10 */
openingsRouter.get("/", getVendorOpenings);

/** GET /api/v1/vendor/openings/:id */
openingsRouter.get("/:id", getVendorOpeningById);

/** POST /api/v1/vendor/openings/:id/profiles/presign */
openingsRouter.post("/:id/profiles/presign", presignVendorProfiles);

/** POST /api/v1/vendor/openings/:id/profiles/upload (multipart) */
openingsRouter.post("/:id/profiles/upload", resumeFilesUpload, uploadVendorProfiles);

/** DELETE /api/v1/vendor/profiles/:profileId (soft delete) */
profilesRouter.delete("/:profileId", deleteVendorProfile);

/** GET /api/v1/vendor/profiles/:profileId/preview */
profilesRouter.get("/:profileId/preview", previewVendorProfile);

export { openingsRouter as vendorOpeningRoutes, profilesRouter as vendorProfileRoutes };
