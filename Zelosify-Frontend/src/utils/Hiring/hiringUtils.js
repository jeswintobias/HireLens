/**
 * Pure helpers shared by the IT Vendor and Hiring Manager contract-hiring
 * screens (formatting, file validation, badge styling). No side effects.
 */

/** Allowed resume types — mirrors the backend rules (backend re-validates). */
export const RESUME_ACCEPT = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
};
export const MAX_RESUME_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 10;
/** Combined size of all files in one submission (backend enforces it too). */
export const MAX_TOTAL_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Number of rows above which long lists switch to virtualized rendering. */
export const VIRTUALIZATION_THRESHOLD = 50;

/**
 * Extracts a user-safe error message from an axios error.
 * @param {unknown} error
 * @param {string} fallback
 */
export const getApiErrorMessage = (error, fallback = "Something went wrong") => {
  const data = error?.response?.data;
  if (typeof data?.message === "string") {
    const details = Array.isArray(data.details) ? ` (${data.details.join(", ")})` : "";
    return `${data.message}${details}`;
  }
  if (error?.response?.status === 401) return "Your session has expired. Please sign in again.";
  if (error?.response?.status === 403) return "You do not have access to this resource.";
  return error?.message && !error?.response ? "Network error — is the server running?" : fallback;
};

/** "6.5 s" / "850 ms" */
export const formatLatency = (ms) => {
  if (ms === null || ms === undefined) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
};

export const formatPercent = (value) =>
  value === null || value === undefined ? "—" : `${value}%`;

export const formatFileSize = (bytes) => {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatDateTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const formatExperience = (min, max) =>
  max === null || max === undefined ? `${min}+ years` : `${min}-${max} years`;

const titleCase = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Splits an opening description into body text and the "Required skills:"
 * line (seeded descriptions end with it).
 */
export const splitDescription = (description) => {
  if (!description) return { text: "", skills: [] };
  const lines = description.split("\n");
  const idx = lines.findIndex((l) => /^\s*required skills\s*:/i.test(l));
  if (idx === -1) return { text: description.trim(), skills: [] };
  const skills = lines[idx]
    .replace(/^\s*required skills\s*:/i, "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  lines.splice(idx, 1);
  return { text: lines.join("\n").trim(), skills };
};

export const statusLabel = (status) => titleCase(status);

/**
 * Client-side pre-check of dropped files (the backend validates again,
 * including file signatures). Returns accepted files and readable errors.
 * @param {File[]} incoming
 * @param {File[]} existing - files already staged
 */
export const validateResumeFiles = (incoming, existing = []) => {
  const errors = [];
  const accepted = [];
  const names = new Set(existing.map((f) => f.name.toLowerCase()));
  let total = existing.reduce((sum, f) => sum + f.size, 0);

  for (const file of incoming) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".pdf") && !lower.endsWith(".pptx")) {
      errors.push(`${file.name}: only PDF and PPTX files are allowed`);
    } else if (file.size > MAX_RESUME_SIZE_BYTES) {
      errors.push(`${file.name}: larger than 10 MB`);
    } else if (file.size === 0) {
      errors.push(`${file.name}: file is empty`);
    } else if (names.has(lower)) {
      errors.push(`${file.name}: already added`);
    } else if (existing.length + accepted.length >= MAX_FILES_PER_UPLOAD) {
      errors.push(`${file.name}: at most ${MAX_FILES_PER_UPLOAD} files per submission`);
    } else if (total + file.size > MAX_TOTAL_UPLOAD_BYTES) {
      errors.push(`${file.name}: would take this submission over 10 MB in total`);
    } else {
      names.add(lower);
      accepted.push(file);
      total += file.size;
    }
  }
  return { accepted, errors };
};

/**
 * Opens a backend-streamed file (Blob) in a new tab; PPTX cannot be
 * rendered by browsers, so it is downloaded instead.
 */
export const openBlobInNewTab = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const isPdf = fileName?.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    window.open(url, "_blank", "noopener,noreferrer");
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "resume";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
