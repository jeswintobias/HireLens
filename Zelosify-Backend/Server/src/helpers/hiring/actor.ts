import type { Request } from "express";
import type { Actor } from "../../types/hiring.js";
import { HttpError } from "../../utils/errors/httpError.js";

/**
 * Resolves the caller's identity from the request populated by
 * `authenticateUser`. The tenant always comes from the server-side user
 * record, never from client input, so tenant filtering cannot be bypassed.
 */
export function getActor(req: Request): Actor {
  const userId: string | undefined = req.user?.id;
  const tenantId: string | undefined = req.user?.tenant?.tenantId;

  if (!userId) {
    throw new HttpError(401, "Authentication required");
  }
  if (!tenantId) {
    throw HttpError.forbidden("User is not assigned to a tenant");
  }
  return { userId, tenantId };
}
