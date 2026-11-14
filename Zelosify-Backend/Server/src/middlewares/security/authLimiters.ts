import jwt from "jsonwebtoken";
import type { Request } from "express";
import { createAttemptLimiter } from "./attemptLimiter.js";

/**
 * Brute-force limits for the public auth endpoints.
 *
 *   verify-totp   5 wrong codes per account → 15 min lock   (+ 20 per IP)
 *   verify-login  5 wrong passwords per account+IP → 15 min (+ 20 per IP)
 *   register      10 rejected registration keys per IP → 15 min
 *
 * A 6-digit TOTP has 1,000,000 combinations; at 5 guesses per 15 minutes an
 * attacker who already has the password would need years, not minutes.
 */

const MINUTES = 60 * 1000;
const ip = (req: Request) => req.ip || req.socket.remoteAddress || "unknown";

/** Account id from the temp_token cookie. Only used as a counter key; the
 *  handler still verifies the token's signature. */
function totpAccount(req: Request): string | null {
  const token = req.cookies?.temp_token;
  if (!token) return null;
  const payload = jwt.decode(token);
  const userId = payload && typeof payload === "object" ? payload.userId : null;
  return userId ? `totp:${userId}` : null;
}

function loginAccount(req: Request): string | null {
  const id = req.body?.usernameOrEmail;
  return typeof id === "string" && id.trim() ? `login:${id.trim().toLowerCase()}|${ip(req)}` : null;
}

export const totpAccountLimiter = createAttemptLimiter({
  name: "verify_totp_account",
  maxFailures: 5,
  windowMs: 15 * MINUTES,
  lockMs: 15 * MINUTES,
  failureStatuses: [401],
  key: totpAccount,
});

export const totpIpLimiter = createAttemptLimiter({
  name: "verify_totp_ip",
  maxFailures: 20,
  windowMs: 15 * MINUTES,
  lockMs: 15 * MINUTES,
  failureStatuses: [401],
  key: (req) => `totp-ip:${ip(req)}`,
});

export const loginAccountLimiter = createAttemptLimiter({
  name: "verify_login_account",
  maxFailures: 5,
  windowMs: 15 * MINUTES,
  lockMs: 15 * MINUTES,
  failureStatuses: [401],
  key: loginAccount,
});

export const loginIpLimiter = createAttemptLimiter({
  name: "verify_login_ip",
  maxFailures: 20,
  windowMs: 15 * MINUTES,
  lockMs: 15 * MINUTES,
  failureStatuses: [401],
  key: (req) => `login-ip:${ip(req)}`,
});

export const registerKeyLimiter = createAttemptLimiter({
  name: "register_key_ip",
  maxFailures: 10,
  windowMs: 15 * MINUTES,
  lockMs: 15 * MINUTES,
  failureStatuses: [403],
  key: (req) => `register-ip:${ip(req)}`,
});

export const ALL_AUTH_LIMITERS = [
  totpAccountLimiter, totpIpLimiter, loginAccountLimiter, loginIpLimiter, registerKeyLimiter,
];
