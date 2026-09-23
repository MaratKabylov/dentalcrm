import { describe, expect, it } from "vitest";

import { saveClinicalEncounterSchema } from "./schemas";

const encounterId = "6f6073d3-0ba8-4bf4-943d-f819df3d4f31";

describe("saveClinicalEncounterSchema", () => {
  it("normalizes empty optional fields", () => {
    const result = saveClinicalEncounterSchema.parse({
      encounterId,
      chiefComplaint: "",
      anamnesis: "  ",
      diagnosisSummary: "Кариес",
      clinicalNotes: "Без осложнений",
      intent: "save",
    });

    expect(result.chiefComplaint).toBeUndefined();
    expect(result.anamnesis).toBeUndefined();
    expect(result.diagnosisSummary).toBe("Кариес");
  });

  it("rejects an unsupported submit intent", () => {
    const result = saveClinicalEncounterSchema.safeParse({
      encounterId,
      intent: "delete",
    });

    expect(result.success).toBe(false);
  });
});
