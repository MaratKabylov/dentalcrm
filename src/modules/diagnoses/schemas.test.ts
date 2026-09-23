import { describe, expect, it } from "vitest";

import { addEncounterDiagnosisSchema } from "./schemas";

const encounterId = "6f6073d3-0ba8-4bf4-943d-f819df3d4f31";
const diagnosisId = "a75eb15e-69c3-443a-a583-879067b4fdcb";

describe("addEncounterDiagnosisSchema", () => {
  it("accepts an existing diagnosis without repeated catalog fields", () => {
    const result = addEncounterDiagnosisSchema.safeParse({
      encounterId,
      diagnosisId,
      code: "",
      name: "",
      system: "local",
      toothCode: "11",
      type: "primary",
      notes: "",
    });

    expect(result.success).toBe(true);
  });

  it("requires code and name for a new diagnosis", () => {
    const result = addEncounterDiagnosisSchema.safeParse({
      encounterId,
      diagnosisId: "",
      code: "",
      name: "",
      system: "icd10",
      toothCode: "",
      type: "secondary",
      notes: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a non-FDI tooth code", () => {
    const result = addEncounterDiagnosisSchema.safeParse({
      encounterId,
      diagnosisId,
      code: "",
      name: "",
      system: "local",
      toothCode: "99",
      type: "primary",
      notes: "",
    });

    expect(result.success).toBe(false);
  });
});
