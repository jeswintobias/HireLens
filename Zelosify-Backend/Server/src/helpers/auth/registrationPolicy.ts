import crypto from "crypto";
import logger from "../../utils/logger/logger.js";

/**
 * Who may self-register with which role (fix for privilege escalation via
 * the public POST /auth/register, which accepts `role` from the body).
 *
 *   SELF_REGISTRATION_ROLES  comma list of roles anyone may self-register
 *                            with (default: none)
 *   REGISTRATION_ADMIN_KEY   secret an administrator shares out-of-band; any
 *                            other role requires it in the
 *                            `X-Registration-Key` header
 *
 * Behaviour:
 *   - role in SELF_REGISTRATION_ROLES            → allowed
 *   - REGISTRATION_ADMIN_KEY set                  → key required (constant-time check)
 *   - no key configured, NODE_ENV=production      → refused (secure default)
 *   - no key configured, development              → allowed with a warning, so
 *     the documented local setup (register users with roles via Postman) works
 */

export const REGISTRATION_KEY_HEADER = "x-registration-key";

export type RegistrationDecision =
  | { allowed: true; via: "self_service" | "registration_key" | "development_open" }
  | { allowed: false; status: 403; message: string };

function parseRoles(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((r) => r.trim().toUpperCase())
    .filter(Boolean);
}

/** Constant-time comparison (hashing first makes the lengths equal). */
function keysMatch(provided: string, expected: string): boolean {
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function checkRegistrationRole(
  role: string,
  providedKey: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): RegistrationDecision {
  if (parseRoles(env.SELF_REGISTRATION_ROLES).includes(role.toUpperCase())) {
    return { allowed: true, via: "self_service" };
  }

  const adminKey = env.REGISTRATION_ADMIN_KEY;
  if (adminKey) {
    if (providedKey && keysMatch(providedKey, adminKey)) {
      return { allowed: true, via: "registration_key" };
    }
    return {
      allowed: false,
      status: 403,
      message: `Registering as ${role} requires an administrator-issued registration key.`,
    };
  }

  if (env.NODE_ENV === "production") {
    return {
      allowed: false,
      status: 403,
      message: `Self-registration as ${role} is disabled.`,
    };
  }

  logger.warn("auth.register.open_registration", {
    role,
    note: "REGISTRATION_ADMIN_KEY is not set; any role can self-register (development only)",
  });
  return { allowed: true, via: "development_open" };
}
