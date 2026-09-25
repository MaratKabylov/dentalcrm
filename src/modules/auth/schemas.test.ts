import { describe, expect, it } from "vitest";

import { registrationSchema } from "./schemas";

const validRegistration = {
  fullName: " Марат Кабылов ",
  email: " ADMIN@CLINIC.KZ ",
  password: "secure-password",
  passwordConfirmation: "secure-password",
};

describe("registrationSchema", () => {
  it("normalizes the name and email", () => {
    const parsed = registrationSchema.parse(validRegistration);
    expect(parsed.fullName).toBe("Марат Кабылов");
    expect(parsed.email).toBe("admin@clinic.kz");
  });

  it("rejects mismatched passwords", () => {
    const parsed = registrationSchema.safeParse({
      ...validRegistration,
      passwordConfirmation: "another-password",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.passwordConfirmation).toBeDefined();
    }
  });

  it("rejects short passwords", () => {
    expect(registrationSchema.safeParse({
      ...validRegistration,
      password: "short",
      passwordConfirmation: "short",
    }).success).toBe(false);
  });
});
