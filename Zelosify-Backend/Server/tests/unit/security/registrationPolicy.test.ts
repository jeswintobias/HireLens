import { describe, expect, it } from "vitest";
import { checkRegistrationRole } from "../../../src/helpers/auth/registrationPolicy";

const env = (vars: Record<string, string>) => ({ ...vars }) as NodeJS.ProcessEnv;

describe("registration role policy", () => {
  it("production without a key: privileged roles are refused", () => {
    for (const role of ["ADMIN", "HIRING_MANAGER", "IT_VENDOR"]) {
      expect(checkRegistrationRole(role, undefined, env({ NODE_ENV: "production" }))).toMatchObject({ allowed: false, status: 403 });
    }
  });

  it("roles listed in SELF_REGISTRATION_ROLES are open to anyone", () => {
    const e = env({ NODE_ENV: "production", SELF_REGISTRATION_ROLES: "it_vendor, BUSINESS_USER" });
    expect(checkRegistrationRole("IT_VENDOR", undefined, e)).toEqual({ allowed: true, via: "self_service" });
    expect(checkRegistrationRole("ADMIN", undefined, e).allowed).toBe(false);
  });

  it("with REGISTRATION_ADMIN_KEY set, other roles need the exact key (any environment)", () => {
    const e = env({ NODE_ENV: "development", REGISTRATION_ADMIN_KEY: "s3cret-key" });
    expect(checkRegistrationRole("ADMIN", undefined, e).allowed).toBe(false);
    expect(checkRegistrationRole("ADMIN", "wrong", e).allowed).toBe(false);
    expect(checkRegistrationRole("ADMIN", "s3cret-key ", e).allowed).toBe(false);
    expect(checkRegistrationRole("ADMIN", "s3cret-key", e)).toEqual({ allowed: true, via: "registration_key" });
  });

  it("development without a key stays open, so the documented local setup works", () => {
    expect(checkRegistrationRole("HIRING_MANAGER", undefined, env({ NODE_ENV: "development" }))).toEqual({
      allowed: true,
      via: "development_open",
    });
  });
});
