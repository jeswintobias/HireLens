import Ajv from "ajv";
import { HttpError } from "../../utils/errors/httpError.js";
import { MAX_FILES_PER_REQUEST } from "./resumeFileTypes.js";

/**
 * Request validation for the hiring module (vendor + hiring manager APIs).
 * Body shapes are validated with JSON Schema (ajv); path/query params with
 * small explicit parsers.
 */

const ajv = new Ajv({ allErrors: true });

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseUuidParam(value: string | undefined, name = "id") {
  if (!value || !UUID_RE.test(value)) {
    throw HttpError.badRequest(`Invalid ${name}`);
  }
  return value;
}

export function parseIntParam(value: string | undefined, name = "id") {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw HttpError.badRequest(`Invalid ${name}`);
  }
  return n;
}

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;

export function parsePagination(query: Record<string, unknown>): Pagination {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit =
    query.limit === undefined ? DEFAULT_PAGE_SIZE : Number(query.limit);

  if (!Number.isInteger(page) || page < 1) {
    throw HttpError.badRequest("page must be a positive integer");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw HttpError.badRequest(
      `limit must be an integer between 1 and ${MAX_PAGE_SIZE}`
    );
  }
  return { page, limit, skip: (page - 1) * limit };
}

const presignBodySchema = {
  type: "object",
  properties: {
    filenames: {
      type: "array",
      minItems: 1,
      maxItems: MAX_FILES_PER_REQUEST,
      items: { type: "string", minLength: 1, maxLength: 200 },
    },
  },
  required: ["filenames"],
  additionalProperties: false,
} as const;

const validatePresign = ajv.compile<{ filenames: string[] }>(presignBodySchema);

export function parsePresignBody(body: unknown): { filenames: string[] } {
  if (!validatePresign(body)) {
    throw HttpError.badRequest(
      "Invalid request body",
      validatePresign.errors?.map((e) => `${e.instancePath || "body"} ${e.message}`)
    );
  }
  return body;
}

/**
 * Upload tokens arrive as a multipart text field. Accepts a JSON array string
 * or repeated `uploadTokens` fields (multer gives an array in that case).
 */
export function parseUploadTokens(raw: unknown): string[] {
  let tokens: unknown = raw;
  if (typeof raw === "string") {
    try {
      tokens = raw.trim().startsWith("[") ? JSON.parse(raw) : [raw];
    } catch {
      throw HttpError.badRequest("uploadTokens must be a JSON array of strings");
    }
  }
  if (
    !Array.isArray(tokens) ||
    tokens.length === 0 ||
    !tokens.every((t) => typeof t === "string" && t.length > 0)
  ) {
    throw HttpError.badRequest("uploadTokens must be a non-empty string array");
  }
  return tokens as string[];
}
