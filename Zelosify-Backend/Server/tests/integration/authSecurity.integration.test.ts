import jwt from "jsonwebtoken";
import { authenticator } from "otplib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../src/config/prisma/prisma";
import { ALL_AUTH_LIMITERS } from "../../src/middlewares/security/authLimiters";
import { createTenantFixture } from "../helpers/fixtures";
import { startTestServer } from "../helpers/testApp";

/**
 * Security fixes on the public auth endpoints, over real HTTP:
 *   - TOTP brute force is stopped after 5 wrong codes (even the right code is refused)
 *   - privileged roles cannot be self-registered
 */
let fx: Awaited<ReturnType<typeof createTenantFixture>>;
let server: Awaited<ReturnType<typeof startTestServer>>;
let secret: string;

beforeAll(async () => {
  fx = await createTenantFixture("auth");
  server = await startTestServer();
  secret = authenticator.generateSecret();
  await prisma.user.update({ where: { id: fx.users.managerA.id }, data: { totpSecret: secret } });
});

beforeEach(() => ALL_AUTH_LIMITERS.forEach((l) => l.reset()));

afterAll(async () => {
  await server?.close();
  await fx?.cleanup();
  await prisma.$disconnect();
});

/** temp_token as issued by verify-login after a correct password. */
const tempCookie = (userId: string) =>
  `temp_token=${jwt.sign({ userId, refreshToken: "test" }, process.env.JWT_SECRET!, { expiresIn: "5m" })}`;

const wrongCode = () => {
  const right = authenticator.generate(secret);
  return String((Number(right) + 500_000) % 1_000_000).padStart(6, "0");
};

describe("TOTP brute-force protection", () => {
  it("locks the account after 5 wrong codes; the correct code is then refused too", async () => {
    const headers = { Cookie: tempCookie(fx.users.managerA.id) };
    for (let i = 0; i < 5; i++) {
      const r = await server.request("POST", "/auth/verify-totp", { body: { totp: wrongCode() }, headers });
      expect(r.status).toBe(401);
    }
    const blocked = await server.request("POST", "/auth/verify-totp", {
      body: { totp: authenticator.generate(secret) },
      headers,
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });

  it("a burst of 50 parallel guesses gets at most 5 real tries", async () => {
    const headers = { Cookie: tempCookie(fx.users.managerA.id) };
    const results = await Promise.all(
      Array.from({ length: 50 }, () => server.request("POST", "/auth/verify-totp", { body: { totp: wrongCode() }, headers }))
    );
    expect(results.filter((r) => r.status === 401).length).toBeLessThanOrEqual(5);
    expect(results.filter((r) => r.status === 429).length).toBeGreaterThanOrEqual(45);
  });

  it("the lock is per account: another user is not affected", async () => {
    const victim = { Cookie: tempCookie(fx.users.managerA.id) };
    for (let i = 0; i < 5; i++) await server.request("POST", "/auth/verify-totp", { body: { totp: wrongCode() }, headers: victim });
    // A different account still gets normal answers (401 for a wrong code, not 429).
    await prisma.user.update({ where: { id: fx.users.managerB.id }, data: { totpSecret: secret } });
    const other = await server.request("POST", "/auth/verify-totp", {
      body: { totp: wrongCode() },
      headers: { Cookie: tempCookie(fx.users.managerB.id) },
    });
    expect(other.status).toBe(401);
  });
});

describe("password brute-force protection", () => {
  it("locks username+IP after 5 failed logins", async () => {
    const body = { usernameOrEmail: "nobody-such-user@example.test", password: "x" };
    for (let i = 0; i < 5; i++) expect((await server.request("POST", "/auth/verify-login", { body })).status).toBe(401);
    expect((await server.request("POST", "/auth/verify-login", { body })).status).toBe(429);
  });
});

describe("privilege escalation via public registration", () => {
  const registration = (role: string) => ({
    username: `attacker-${role.toLowerCase()}`,
    email: `attacker-${role.toLowerCase()}@example.test`,
    password: "Passw0rd!",
    firstName: "A",
    lastName: "B",
    phoneNumber: "0000000000",
    tenantId: fx.tenantA.tenantId,
    department: "Engineering",
    role,
  });

  it("production: self-registering as ADMIN or HIRING_MANAGER is refused (no user created)", async () => {
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      for (const role of ["ADMIN", "HIRING_MANAGER"]) {
        const r = await server.request("POST", "/auth/register", { body: registration(role) });
        expect(r.status).toBe(403);
      }
    } finally {
      process.env.NODE_ENV = before;
    }
    expect(await prisma.user.count({ where: { username: { startsWith: "attacker-" } } })).toBe(0);
  });

  it("with an admin key configured, a wrong key is refused and guessing it gets rate limited", async () => {
    process.env.REGISTRATION_ADMIN_KEY = "correct-horse-battery-staple";
    try {
      const wrong = { "X-Registration-Key": "guess" };
      for (let i = 0; i < 10; i++) {
        expect((await server.request("POST", "/auth/register", { body: registration("ADMIN"), headers: wrong })).status).toBe(403);
      }
      expect((await server.request("POST", "/auth/register", { body: registration("ADMIN"), headers: wrong })).status).toBe(429);
    } finally {
      delete process.env.REGISTRATION_ADMIN_KEY;
    }
  });
});

describe("operator injection on auth endpoints", () => {
  it.each([
    ["/auth/verify-login", { usernameOrEmail: { contains: "" }, password: "x" }, "usernameOrEmail"],
    ["/auth/verify-login", { usernameOrEmail: "a", password: { not: "" } }, "password"],
    ["/auth/verify-totp", { totp: { gt: "" } }, "totp"],
    ["/auth/register", { username: "x", tenantId: { not: "" } }, "tenantId"],
  ])("POST %s rejects a Prisma filter object (%o) with 400", async (path, body, field) => {
    const r = await server.request("POST", path, { body });
    expect(r.status).toBe(400);
    expect(r.data.message).toBe(`Invalid value for ${field}`);
  });

  it("SQL-style text is just text", async () => {
    const r = await server.request("POST", "/auth/verify-login", {
      body: { usernameOrEmail: "' OR 1=1 --", password: "x" },
    });
    expect(r.status).toBe(401);
  });
});

describe("session refresh + public key", () => {
  it("refresh without a session is 401", async () => {
    expect((await server.request("POST", "/auth/refresh")).status).toBe(401);
  });

  it("public key endpoint serves the realm RS256 key (public data only)", async () => {
    const r = await server.request("GET", "/auth/public-key");
    expect(r.status).toBe(200);
    expect(r.data.algorithm).toBe("RS256");
    expect(r.data.publicKey).toMatch(/^MII[A-Za-z0-9+/=]+$/);
    expect(Object.keys(r.data).sort()).toEqual(["algorithm", "publicKey"]);
  });
});

describe("registration field validation", () => {
  it("returns per-field messages and creates nothing", async () => {
    const r = await server.request("POST", "/auth/register", {
      body: {
        username: "1 bad", email: "nope", password: "aaaaaaaa", firstName: "123", lastName: "Ok",
        phoneNumber: "abc", tenantId: "hello", department: "x", role: "IT_VENDOR",
      },
    });
    expect(r.status).toBe(400);
    expect(Object.keys(r.data.fieldErrors).sort()).toEqual(
      ["department", "email", "firstName", "password", "phoneNumber", "tenantId", "username"]
    );
    expect(await prisma.user.count({ where: { email: "nope" } })).toBe(0);
  });
});

describe("sign-up by company name", () => {
  const body = (company: string) => ({
    username: "companyprobe", email: "companyprobe@example.test", password: "Passw0rd99", firstName: "Ann",
    lastName: "Lee", phoneNumber: "+91 90000 00009", department: "Engineering", role: "HIRING_MANAGER", company,
  });
  // In production the registration policy refuses privileged roles with 403. That
  // response proves the company was resolved (otherwise it would be a 400),
  // without creating a real Keycloak user.
  const asProduction = async <T>(fn: () => Promise<T>) => {
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      return await fn();
    } finally {
      process.env.NODE_ENV = before;
    }
  };

  it("resolves an exact company name, ignoring upper/lower case", async () => {
    const name = (await prisma.tenants.findUniqueOrThrow({ where: { tenantId: fx.tenantA.tenantId } })).companyName;
    const r = await asProduction(() => server.request("POST", "/auth/register", { body: body(name.toUpperCase()) }));
    expect(r.status).toBe(403);
  });

  it("accepts an Organization ID pasted into the company field", async () => {
    const r = await asProduction(() => server.request("POST", "/auth/register", { body: body(fx.tenantA.tenantId) }));
    expect(r.status).toBe(403);
  });

  it("unknown company → 400 on the company field", async () => {
    const r = await server.request("POST", "/auth/register", { body: body("No Such Company Ltd") });
    expect(r.status).toBe(400);
    expect(r.data.fieldErrors.company).toMatch(/No company found/);
  });

  it("ambiguous company name → asks for the Organization ID", async () => {
    const dupName = `dup-company-${Date.now()}`;
    const a = await prisma.tenants.create({ data: { companyName: dupName } });
    const b = await prisma.tenants.create({ data: { companyName: dupName } });
    try {
      const r = await server.request("POST", "/auth/register", { body: body(dupName) });
      expect(r.status).toBe(400);
      expect(r.data.fieldErrors.company).toMatch(/Organization ID/);
    } finally {
      await prisma.tenants.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } });
    }
  });
});
