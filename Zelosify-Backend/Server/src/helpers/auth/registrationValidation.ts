import type { NextFunction, Request, Response } from "express";

/**
 * Field rules for POST /auth/register (the frontend mirrors them in
 * src/utils/Auth/registrationRules.js for instant feedback; this is the
 * authoritative check because the API can be called directly).
 *
 * Values are trimmed before checking and saving, so " vendor1 " cannot be
 * stored and then fail to match at login.
 */

export type RegistrationField =
  | "firstName"
  | "lastName"
  | "username"
  | "email"
  | "phoneNumber"
  | "department"
  | "tenantId"
  | "password";

const NAME = /^[\p{L}][\p{L} .'-]{0,49}$/u;
const USERNAME = /^[A-Za-z][A-Za-z0-9._-]{2,29}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_CHARS = /^\+?[0-9 ()-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns an error message, or null when the value is valid. */
export const REGISTRATION_RULES: Record<RegistrationField, (v: string, all: Record<string, string>) => string | null> = {
  firstName: (v) => (NAME.test(v) ? null : "Use 1–50 letters (spaces, apostrophes, dots and hyphens allowed)"),
  lastName: (v) => (NAME.test(v) ? null : "Use 1–50 letters (spaces, apostrophes, dots and hyphens allowed)"),
  username: (v) =>
    USERNAME.test(v) ? null : "Use 3–30 characters: start with a letter, then letters, numbers, dots, underscores or hyphens",
  email: (v) => (v.length <= 254 && EMAIL.test(v) ? null : "Enter a valid email address"),
  phoneNumber: (v) => {
    const digits = v.replace(/\D/g, "").length;
    return PHONE_CHARS.test(v) && digits >= 7 && digits <= 15
      ? null
      : "Enter 7–15 digits (an optional leading + and spaces or dashes are fine)";
  },
  department: (v) => (v.length >= 2 && v.length <= 60 ? null : "Use 2–60 characters"),
  tenantId: (v) => (UUID.test(v) ? null : "Organization IDs look like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"),
  password: (v, all) => {
    if (v.length < 8 || v.length > 128) return "Use 8–128 characters";
    if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return "Include at least one letter and one number";
    const user = (all.username ?? "").toLowerCase();
    if (user.length >= 3 && v.toLowerCase().includes(user)) return "Must not contain your username";
    return null;
  },
};

const TRIMMED: (RegistrationField | "role")[] = [
  "firstName", "lastName", "username", "email", "phoneNumber", "department", "tenantId", "role",
];

export function validateRegistration(body: Record<string, unknown>) {
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (typeof v === "string") values[k] = TRIMMED.includes(k as RegistrationField) ? v.trim() : v;
  }
  const fieldErrors: Partial<Record<RegistrationField, string>> = {};
  for (const field of Object.keys(REGISTRATION_RULES) as RegistrationField[]) {
    const value = values[field] ?? "";
    if (!value) {
      fieldErrors[field] = "This field is required";
      continue;
    }
    const error = REGISTRATION_RULES[field](value, values);
    if (error) fieldErrors[field] = error;
  }
  return { values, fieldErrors };
}

/** Express middleware: 400 with per-field messages, otherwise trimmed body. */
export function validateRegistrationBody(req: Request, res: Response, next: NextFunction): void {
  const { values, fieldErrors } = validateRegistration(req.body ?? {});
  if (Object.keys(fieldErrors).length > 0) {
    res.status(400).json({ message: "Please fix the highlighted fields.", fieldErrors });
    return;
  }
  req.body = { ...req.body, ...values };
  next();
}
