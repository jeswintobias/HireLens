import type { NextFunction, Request, Response } from "express";
import prisma from "../../config/prisma/prisma.js";
import { isUuid } from "./registrationValidation.js";

/**
 * Turns the sign-up form's "Company" field into the tenant ID the
 * registration handler needs.
 *
 *   tenantId given            → used as is (setup guide / Postman contract)
 *   company looks like a UUID → used as the tenant ID
 *   company is a name         → case-insensitive exact match on companyName
 *                                0 matches  → 400 "No company found …"
 *                                2+ matches → 400 "… use your Organization ID"
 *
 * Joining a company still goes through the registration policy (production
 * refuses self-registration unless a role is allowed or an admin key is sent).
 */
export async function resolveCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { tenantId, company } = req.body ?? {};
  if (tenantId || !company) return next();

  if (isUuid(company)) {
    req.body.tenantId = company;
    return next();
  }

  try {
    const matches = await prisma.tenants.findMany({
      where: { companyName: { equals: company, mode: "insensitive" } },
      select: { tenantId: true },
      take: 2,
    });
    if (matches.length === 0) {
      res.status(400).json({
        message: "Please fix the highlighted fields.",
        fieldErrors: { company: "No company found with that name. Check the spelling or use your Organization ID." },
      });
      return;
    }
    if (matches.length > 1) {
      res.status(400).json({
        message: "Please fix the highlighted fields.",
        fieldErrors: { company: "Several companies share that name. Please use your Organization ID instead." },
      });
      return;
    }
    req.body.tenantId = matches[0].tenantId;
    next();
  } catch (error) {
    next(error);
  }
}
