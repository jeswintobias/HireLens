/**
 * HTTP-aware error thrown by services and mapped to a response by controllers.
 *
 * Services throw `HttpError` for expected failures (bad input, not found,
 * forbidden). Anything else is treated as an unexpected 500.
 *
 * Not-found and cross-tenant access deliberately share the same 404 so a
 * caller can never learn that a resource exists in another tenant.
 */
export class HttpError extends Error {
  public readonly status: number;
  public readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new HttpError(400, message, details);
  }

  static forbidden(message = "Forbidden") {
    return new HttpError(403, message);
  }

  static notFound(message = "Resource not found") {
    return new HttpError(404, message);
  }

  static conflict(message: string) {
    return new HttpError(409, message);
  }
}
