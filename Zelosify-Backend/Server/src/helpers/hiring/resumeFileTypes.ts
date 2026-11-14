/**
 * Resume file type rules for the hiring module.
 * The task requires PDF and PPTX support; nothing else is accepted.
 */

export const RESUME_FILE_TYPES = {
  pdf: { mimeType: "application/pdf" },
  pptx: {
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
} as const;

export type ResumeExtension = keyof typeof RESUME_FILE_TYPES;

export const MAX_RESUME_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_FILES_PER_REQUEST = 10;

export function getResumeExtension(filename: string): ResumeExtension | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext && ext in RESUME_FILE_TYPES ? (ext as ResumeExtension) : null;
}

export function getResumeMimeType(filename: string): string {
  const ext = getResumeExtension(filename);
  return ext ? RESUME_FILE_TYPES[ext].mimeType : "application/octet-stream";
}

/**
 * Checks the file's leading bytes ("magic numbers") so a renamed file
 * (e.g. an .exe called resume.pdf) is rejected.
 * - PDF starts with "%PDF-"
 * - PPTX is a ZIP container and starts with "PK\x03\x04"
 */
export function hasValidSignature(buffer: Buffer, ext: ResumeExtension) {
  if (ext === "pdf") {
    return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
  }
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

/** Original filename stored in the S3 key: `<timestamp>_<filename>`. */
export function filenameFromS3Key(s3Key: string): string {
  const last = s3Key.split("/").pop() ?? s3Key;
  return last.replace(/^\d+_/, "");
}
