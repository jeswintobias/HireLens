/**
 * Sign-up field rules for instant feedback. They mirror the backend's
 * authoritative check (Zelosify-Backend/Server/src/helpers/auth/registrationValidation.ts);
 * keep the two in sync.
 */

const NAME = /^[\p{L}][\p{L} .'-]{0,49}$/u;
const USERNAME = /^[A-Za-z][A-Za-z0-9._-]{2,29}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_CHARS = /^\+?[0-9 ()-]+$/;

const NAME_MSG = "Use 1–50 letters (spaces, apostrophes, dots and hyphens allowed)";

/** Listed in on-screen order, so the first invalid field gets focus. */
export const REGISTRATION_RULES = {
  // Company name (e.g. "Bruce Wayne Corp") or an Organization ID; the backend resolves it.
  company: (v) => (v.length >= 2 && v.length <= 100 ? null : "Use 2–100 characters"),
  firstName: (v) => (NAME.test(v) ? null : NAME_MSG),
  lastName: (v) => (NAME.test(v) ? null : NAME_MSG),
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
  password: (v, all) => {
    if (v.length < 8 || v.length > 128) return "Use 8–128 characters";
    if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return "Include at least one letter and one number";
    const user = (all.username ?? "").trim().toLowerCase();
    if (user.length >= 3 && v.toLowerCase().includes(user)) return "Must not contain your username";
    return null;
  },
  confirmPassword: (v, all) => (v === all.password ? null : "Passwords do not match"),
};

const TRIMMED = new Set(["firstName", "lastName", "username", "email", "phoneNumber", "department", "company"]);

/** Error message for one field, or null. Empty values are "required". */
export function validateField(name, values) {
  const rule = REGISTRATION_RULES[name];
  if (!rule) return null;
  const raw = values[name] ?? "";
  const value = TRIMMED.has(name) ? raw.trim() : raw;
  if (!value) return "This field is required";
  return rule(value, values);
}

/** All field errors as { field: message }. */
export function validateAll(values) {
  const errors = {};
  for (const name of Object.keys(REGISTRATION_RULES)) {
    const error = validateField(name, values);
    if (error) errors[name] = error;
  }
  return errors;
}
