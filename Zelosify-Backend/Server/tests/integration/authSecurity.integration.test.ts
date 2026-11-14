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
    department: "X",
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
