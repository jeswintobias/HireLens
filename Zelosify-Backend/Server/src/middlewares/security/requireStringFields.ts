import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Rejects request bodies where the named fields are not plain strings.
 *
 * Prisma accepts filter objects in `where` clauses, so a JSON body like
 * { "usernameOrEmail": { "contains": "" } } would otherwise be turned into a
 * query operator (operator injection): it matched a real user and let an
 * attacker enumerate emails letter by letter. Missing fields are left to the
 * handler's own "required" checks.
 */
export function requireStringFields(fields: string[], maxLength = 512): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    for (const field of fields) {
      const value = (body as Record<string, unknown>)[field];
      if (value === undefined || value === null) continue;
      if (typeof value !== "string" || value.length > maxLength) {
        res.status(400).json({ message: `Invalid value for ${field}` });
        return;
      }
    }
    next();
  };
}
