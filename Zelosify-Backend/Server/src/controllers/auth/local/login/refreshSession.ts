import axios from "axios";
import type { CookieOptions, Request, Response } from "express";
import { getKeycloakClientSecret } from "../../../../utils/keycloak/getKeycloakClientSecret.js";
import logger from "../../../../utils/logger/logger.js";

/**
 * POST /api/v1/auth/refresh
 *
 * Exchanges the httpOnly refresh_token cookie for a new access/refresh token
 * pair (Keycloak refresh grant) and re-sets both cookies, so an active user
 * is not sent back to the login page when the access token expires.
 * Tokens never appear in the response body.
 *
 * Fails with 401 (and clears the cookies) once Keycloak ends the session
 * (idle / max lifespan configured in the realm).
 */
const cookieBase = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
});

export const refreshSession = async (req: Request, res: Response): Promise<void> => {
  const refreshToken = req.cookies?.refresh_token;
  if (typeof refreshToken !== "string" || !refreshToken) {
    res.status(401).json({ message: "No active session" });
    return;
  }

  try {
    const tokenResponse = await axios.post(
      `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.KEYCLOAK_CLIENT_ID!,
        client_secret: await getKeycloakClientSecret(),
        refresh_token: refreshToken,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 5000 }
    );

    res.cookie("access_token", tokenResponse.data.access_token, { ...cookieBase(), maxAge: 4 * 3600 * 1000 });
    res.cookie("refresh_token", tokenResponse.data.refresh_token, { ...cookieBase(), maxAge: 24 * 3600 * 1000 });
    res.json({ message: "Session refreshed" });
  } catch (error: any) {
    logger.info("auth.session.refresh_failed", { status: error?.response?.status, reason: error?.response?.data?.error });
    res.clearCookie("access_token", cookieBase());
    res.clearCookie("refresh_token", cookieBase());
    res.status(401).json({ message: "Your session has expired. Please sign in again." });
  }
};

/**
 * GET /api/v1/auth/public-key
 *
 * The realm's RS256 public key (public by definition), so the frontend route
 * guard can verify token signatures without its own configuration.
 */
export const getPublicKey = (_req: Request, res: Response): void => {
  const key = process.env.KEYCLOAK_RS256_SIG;
  if (!key) {
    res.status(503).json({ message: "Public key not configured" });
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({ algorithm: "RS256", publicKey: key.replace(/-----[^-]+-----|\s/g, "") });
};
