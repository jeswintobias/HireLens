import express from "express";
import vendorRequestRoutes from "./vendorRequestRoutes.js";
import { vendorOpeningRoutes, vendorProfileRoutes } from "./vendorOpeningRoutes.js";

const router = express.Router();

/**
 * @route /vendor/requests
 */
router.use("/requests", vendorRequestRoutes);

/**
 * @route /vendor/openings  (IT_VENDOR contract openings + profile uploads)
 */
router.use("/openings", vendorOpeningRoutes);

/**
 * @route /vendor/profiles  (IT_VENDOR profile soft delete + preview)
 */
router.use("/profiles", vendorProfileRoutes);

export default router;
