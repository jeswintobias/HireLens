import type { Response } from "express";
import { Prisma } from "@prisma/client";
import { HttpError } from "../errors/httpError.js";
import logger from "../logger/logger.js";

/**
 * Maps an error thrown by the service layer to an HTTP response.
 * Unknown errors never leak internal messages to the client.
 */
export function sendError(res: Response, err: unknown, event: string): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2025"
  ) {
    res.status(404).json({ message: "Resource not found" });
    return;
  }

  logger.error(event, { error: err });
  res.status(500).json({ message: "Internal server error" });
}
