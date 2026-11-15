// src/routers/auth/normalAuthRoutes.ts
import {
  Router,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import asyncHandler from "../../../utils/handler/asyncHandler.js";
import { authenticateUser } from "../../../middlewares/auth/authenticateMiddleware.js";
import {
  logout,
  register,
  verifyLogin,
  verifyTOTP,
  refreshSession,
  getPublicKey,
} from "../../../controllers/controllers.js";
import { requireStringFields } from "../../../middlewares/security/requireStringFields.js";
import { AuthenticatedRequest } from "../../../types/common.js";
import {
  loginAccountLimiter,
  loginIpLimiter,
  registerKeyLimiter,
  totpAccountLimiter,
  totpIpLimiter,
} from "../../../middlewares/security/authLimiters.js";

/**
 * Wraps async handlers to ensure void return type
 * @param handler - The request handler to wrap
 * @returns Wrapped RequestHandler with proper error handling
 */
const wrapHandler = (handler: RequestHandler): RequestHandler =>
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    await handler(req, res, next);
  });

/**
 * Wraps async handlers for middleware-protected routes
 * @param handler - The request handler to wrap
 * @returns Wrapped RequestHandler with proper error handling
 */
const wrapProtectedHandler = (handler: RequestHandler): RequestHandler =>
  asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      await handler(req, res, next);
    }
  );

const router = Router();

/**
 * =============================================================================
 * LOCAL AUTHENTICATION ROUTES
 * =============================================================================
 */

/**
 * POST /register - Register new user account
 * Creates a new user account with provided credentials
 */
router.post(
  "/register",
  requireStringFields(["username", "email", "password", "firstName", "lastName", "phoneNumber", "tenantId", "department", "role"]),
  registerKeyLimiter,
  wrapHandler(register)
);

/**
 * POST /verify-login - Verify user login credentials
 * Validates user credentials and initiates login process
 */
router.post("/verify-login", requireStringFields(["usernameOrEmail", "password"]), loginIpLimiter, loginAccountLimiter, wrapHandler(verifyLogin));

/**
 * POST /verify-totp - Verify TOTP for two-factor authentication
 * Validates TOTP code for users with 2FA enabled
 */
router.post("/verify-totp", requireStringFields(["totp"]), totpIpLimiter, totpAccountLimiter, wrapHandler(verifyTOTP));

/** Silent session refresh (refresh_token cookie → new cookies). */
router.post("/refresh", wrapHandler(refreshSession));

/** Realm RS256 public key for the frontend route guard (public data). */
router.get("/public-key", getPublicKey);

/**
 * POST /logout - Logout authenticated user
 * Requires authentication middleware to access user session
 */
router.post("/logout", authenticateUser, wrapProtectedHandler(logout));

export default router;
