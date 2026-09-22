import { describe, expect, it } from "vitest";

import { createPatientSchema } from "./schemas";

const validPatient = {
  lastName: " Кабылов ",
  firstName: "Марат",
  middleName: "",
  birthDate: "1990-05-12",
  gender: "male",
  phone: "+7 (700) 123-45-67",
  iin: "900512300123",
  email: "",
  primaryBranchId: "",
  consentPersonalData: true,
  consentMarketing: false,
};

describe("createPatientSchema", () => {
  it("normalizes optional empty form values", () => {
    const parsed = createPatientSchema.parse(validPatient);

    expect(parsed.lastName).toBe("Кабылов");
    expect(parsed.middleName).toBeUndefined();
    expect(parsed.email).toBeUndefined();
    expect(parsed.primaryBranchId).toBeUndefined();
  });

  it("rejects malformed Kazakhstan identifiers and phone numbers", () => {
    const parsed = createPatientSchema.safeParse({
      ...validPatient,
      iin: "123",
      phone: "12",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      expect(errors.iin).toBeDefined();
      expect(errors.phone).toBeDefined();
    }
  });

  it("rejects a birth date in the future", () => {
    const parsed = createPatientSchema.safeParse({
      ...validPatient,
      birthDate: "2999-01-01",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.birthDate).toBeDefined();
    }
  });
});
