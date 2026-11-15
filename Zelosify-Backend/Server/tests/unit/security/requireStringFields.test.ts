import { describe, expect, it, vi } from "vitest";
import { requireStringFields } from "../../../src/middlewares/security/requireStringFields";

const run = (body: unknown) => {
  const res: any = { statusCode: 200 };
  res.status = vi.fn((c: number) => ((res.statusCode = c), res));
  res.json = vi.fn(() => res);
  const next = vi.fn();
  requireStringFields(["user", "pass"], 10)({ body } as any, res, next);
  return { res, next };
};

describe("requireStringFields", () => {
  it("passes plain strings and leaves missing fields to the handler", () => {
    expect(run({ user: "a", pass: "b" }).next).toHaveBeenCalled();
    expect(run({ user: "a" }).next).toHaveBeenCalled();
    expect(run(undefined).next).toHaveBeenCalled();
  });

  it.each([{ contains: "" }, ["a"], 5, true])("rejects %o", (value) => {
    const { res, next } = run({ user: value });
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects oversized strings", () => {
    expect(run({ user: "x".repeat(11) }).res.statusCode).toBe(400);
  });
});
