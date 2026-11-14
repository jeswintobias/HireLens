import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unauthorized-access and tenant-leakage unit tests.
 * Prisma is mocked, so these check the rules themselves: every query a
 * service sends is scoped to the caller's tenant (and owner), and a miss is
 * reported as 404 — never as "exists in another tenant".
 */
const prismaMock = vi.hoisted(() => ({
  opening: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  hiringProfile: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn(), groupBy: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
}));
vi.mock("@/config/prisma/prisma", () => ({ default: prismaMock }));

import { authorizeRole } from "../../../src/middlewares/auth/authorizeMiddleware";
import { authenticateUser } from "../../../src/middlewares/auth/authenticateMiddleware";
import { getActor } from "../../../src/helpers/hiring/actor";
import * as vendorOpenings from "../../../src/services/vendor/vendorOpeningService";
import * as vendorProfiles from "../../../src/services/vendor/vendorProfileService";
import * as manager from "../../../src/services/hiringManager/hiringManagerService";
import { forgedToken, signToken } from "../../helpers/auth";

function mockRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn((c: number) => ((res.statusCode = c), res));
  res.json = vi.fn((b: unknown) => ((res.body = b), res));
  return res;
}

async function runMiddleware(mw: any, token?: string) {
  const req: any = { headers: token ? { authorization: `Bearer ${token}` } : {}, cookies: {} };
  const res = mockRes();
  const next = vi.fn();
  await mw(req, res, next);
  // authorizeRole verifies asynchronously via callback.
  await new Promise((r) => setTimeout(r, 0));
  return { req, res, next };
}

const actorA = { userId: "manager-a", tenantId: "tenant-a" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findMany.mockResolvedValue([]);
});

describe("unauthorized access", () => {
  it("authorizeRole: 401 without a token", async () => {
    const { res, next } = await runMiddleware(authorizeRole("IT_VENDOR"));
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("authorizeRole: 401 for a token signed by an untrusted key", async () => {
    const { res, next } = await runMiddleware(authorizeRole("IT_VENDOR"), forgedToken("u1", ["IT_VENDOR"]));
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("authorizeRole: 401 for an expired token", async () => {
    const { res } = await runMiddleware(authorizeRole("IT_VENDOR"), signToken("u1", ["IT_VENDOR"], { expiresIn: -10 }));
    expect(res.statusCode).toBe(401);
  });

  it("authorizeRole: 403 when the role is missing (vendor → manager API)", async () => {
    const { res, next } = await runMiddleware(authorizeRole("HIRING_MANAGER"), signToken("u1", ["IT_VENDOR"]));
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("authorizeRole: passes with the right role", async () => {
    const { next } = await runMiddleware(authorizeRole("HIRING_MANAGER"), signToken("u1", ["HIRING_MANAGER"]));
    expect(next).toHaveBeenCalledOnce();
  });

  it("authenticateUser: 401 for a valid token whose user is not in the database", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const { res, next } = await runMiddleware(authenticateUser, signToken("ghost-user", ["IT_VENDOR"]));
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("authenticateUser: 401 for a malformed token", async () => {
    const { res } = await runMiddleware(authenticateUser, "not-a-jwt");
    expect(res.statusCode).toBe(401);
  });

  it("getActor: 401 without a user, 403 without a tenant", () => {
    expect(() => getActor({} as any)).toThrow(expect.objectContaining({ status: 401 }));
    expect(() => getActor({ user: { id: "u1" } } as any)).toThrow(expect.objectContaining({ status: 403 }));
  });

  it("getActor: tenant comes from the server-side user, never from client input", () => {
    const req: any = {
      user: { id: "u1", tenant: { tenantId: "tenant-a" } },
      body: { tenantId: "tenant-b" },
      query: { tenantId: "tenant-b" },
      headers: { "x-tenant-id": "tenant-b" },
    };
    expect(getActor(req)).toEqual({ userId: "u1", tenantId: "tenant-a" });
  });
});

describe("tenant leakage", () => {
  it("vendor opening list is filtered by the caller's tenant", async () => {
    prismaMock.opening.count.mockResolvedValue(0);
    prismaMock.opening.findMany.mockResolvedValue([]);
    await vendorOpenings.listOpenings(actorA, { page: 1, limit: 10, skip: 0 });
    expect(prismaMock.opening.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: "tenant-a" });
    expect(prismaMock.opening.count.mock.calls[0][0].where).toMatchObject({ tenantId: "tenant-a" });
  });

  it("vendor opening detail from another tenant → 404 (not 403)", async () => {
    prismaMock.opening.findFirst.mockResolvedValue(null);
    await expect(vendorOpenings.getOpeningDetail(actorA, "opening-of-tenant-b")).rejects.toMatchObject({ status: 404 });
    expect(prismaMock.opening.findFirst.mock.calls[0][0].where).toEqual({ id: "opening-of-tenant-b", tenantId: "tenant-a" });
  });

  it("vendor profile delete is scoped to tenant + uploader", async () => {
    prismaMock.hiringProfile.findFirst.mockResolvedValue(null);
    await expect(vendorProfiles.softDeleteProfile(actorA, 42)).rejects.toMatchObject({ status: 404 });
    expect(prismaMock.hiringProfile.findFirst.mock.calls[0][0].where).toEqual({
      id: 42, uploadedBy: "manager-a", isDeleted: false, opening: { tenantId: "tenant-a" },
    });
  });

  it("manager openings are scoped to tenant AND owning manager", async () => {
    prismaMock.opening.count.mockResolvedValue(0);
    prismaMock.opening.findMany.mockResolvedValue([]);
    await manager.listOwnOpenings(actorA, { page: 1, limit: 10, skip: 0 });
    expect(prismaMock.opening.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: "tenant-a", hiringManagerId: "manager-a",
    });
  });

  it("manager cannot see profiles of an opening they do not own → 404", async () => {
    prismaMock.opening.findFirst.mockResolvedValue(null);
    await expect(
      manager.listOpeningProfiles(actorA, "someone-elses-opening", { page: 1, limit: 10, skip: 0 })
    ).rejects.toMatchObject({ status: 404 });
    expect(prismaMock.hiringProfile.findMany).not.toHaveBeenCalled();
  });

  it("shortlist / reject / preview look the profile up through tenant + owner", async () => {
    prismaMock.hiringProfile.findFirst.mockResolvedValue(null);
    for (const call of [
      () => manager.shortlistProfile(actorA, 9),
      () => manager.rejectProfile(actorA, 9),
      () => manager.getManagedProfileFile(actorA, 9),
      () => manager.requestRecommendationRerun(actorA, 9),
    ]) {
      await expect(call()).rejects.toMatchObject({ status: 404 });
    }
    for (const [args] of prismaMock.hiringProfile.findFirst.mock.calls) {
      expect(args.where).toEqual({
        id: 9, isDeleted: false, opening: { tenantId: "tenant-a", hiringManagerId: "manager-a" },
      });
    }
    expect(prismaMock.hiringProfile.updateMany).not.toHaveBeenCalled();
  });
});
