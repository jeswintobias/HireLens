import express from "express";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAttemptLimiter } from "../../../src/middlewares/security/attemptLimiter";

/** Real HTTP so the limiter sees genuine response lifecycles. */
const limiter = createAttemptLimiter({
  name: "test",
  maxFailures: 3,
  windowMs: 300,
  lockMs: 300,
  failureStatuses: [401],
  key: (req) => (req.query.user as string) || null,
});

let base = "";
let close: () => void;

beforeAll(async () => {
  const app = express();
  app.get("/try", limiter, async (req, res) => {
    if (req.query.slow) await new Promise((r) => setTimeout(r, 100));
    res.status(Number(req.query.status ?? 200)).json({ ok: true });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());
beforeEach(() => limiter.reset());

const attempt = (user: string, status: number, extra = "") =>
  fetch(`${base}/try?user=${user}&status=${status}${extra}`).then((r) => ({ status: r.status, retryAfter: r.headers.get("retry-after") }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("failed-attempt limiter", () => {
  it("locks a key after maxFailures failures, even for a correct attempt", async () => {
    for (let i = 0; i < 3; i++) expect((await attempt("a", 401)).status).toBe(401);
    const blocked = await attempt("a", 200);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.retryAfter)).toBeGreaterThan(0);
  });

  it("only counts failures; other keys are unaffected", async () => {
    for (let i = 0; i < 3; i++) await attempt("a", 401);
    expect((await attempt("b", 401)).status).toBe(401);
    expect((await attempt("c", 400)).status).toBe(400); // not a counted status
  });

  it("a success clears the counter", async () => {
    await attempt("a", 401);
    await attempt("a", 401);
    await attempt("a", 200);
    await attempt("a", 401);
    expect((await attempt("a", 401)).status).toBe(401);
  });

  it("unlocks after the lock period", async () => {
    for (let i = 0; i < 3; i++) await attempt("a", 401);
    expect((await attempt("a", 401)).status).toBe(429);
    await sleep(350);
    expect((await attempt("a", 401)).status).toBe(401);
  });

  it("parallel guesses cannot exceed the limit (in-flight requests count)", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => attempt("a", 401, "&slow=1")));
    expect(results.filter((r) => r.status === 401)).toHaveLength(3);
    expect(results.filter((r) => r.status === 429)).toHaveLength(17);
  });

  it("requests without a key are not limited", async () => {
    for (let i = 0; i < 5; i++) expect((await fetch(`${base}/try?status=401`)).status).toBe(401);
  });
});
