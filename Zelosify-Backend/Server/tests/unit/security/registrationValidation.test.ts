import { describe, expect, it } from "vitest";
import { validateRegistration } from "../../../src/helpers/auth/registrationValidation";

const valid = {
  firstName: "Uma",
  lastName: "O'Neil-Rao",
  username: "uma.vendor_1",
  email: "uma@example.com",
  phoneNumber: "+91 98765-43210",
  department: "Staffing",
  tenantId: "f1a16b6e-684c-4359-bcb3-3a0e5253c471",
  password: "Secure123",
  role: "IT_VENDOR",
};
const errorsFor = (patch: Record<string, unknown>) => validateRegistration({ ...valid, ...patch }).fieldErrors;

describe("registration validation", () => {
  it("accepts a valid form (incl. unicode names and formatted phones)", () => {
    expect(errorsFor({})).toEqual({});
    expect(errorsFor({ firstName: "Zoë", lastName: "Ñúñez" })).toEqual({});
  });

  it("trims surrounding spaces before checking and saving", () => {
    const { values, fieldErrors } = validateRegistration({ ...valid, username: "  uma.vendor_1 ", email: " uma@example.com " });
    expect(fieldErrors).toEqual({});
    expect(values.username).toBe("uma.vendor_1");
    expect(values.email).toBe("uma@example.com");
  });

  it("reports every missing field", () => {
    expect(Object.keys(validateRegistration({}).fieldErrors).sort()).toEqual(
      ["department", "email", "firstName", "lastName", "password", "phoneNumber", "tenantId", "username"]
    );
  });

  it.each([
    ["firstName", "123"],
    ["firstName", "x".repeat(51)],
    ["username", "ab"],
    ["username", "1user"],
    ["username", "has space"],
    ["username", "emoji😀"],
    ["email", "not-an-email"],
    ["email", "a@b"],
    ["phoneNumber", "abc"],
    ["phoneNumber", "12345"],
    ["phoneNumber", "1".repeat(16)],
    ["department", "x"],
    ["tenantId", "hello"],
    ["password", "short1"],
    ["password", "aaaaaaaa"],
    ["password", "12345678"],
    ["password", "uma.vendor_1x9"],
  ])("rejects %s = %j", (field, value) => {
    expect(errorsFor({ [field]: value })).toHaveProperty(field);
  });
});
