import { describe, expect, it } from "vitest";

import { recallFiltersSchema, saveRecallSchema } from "./schemas";

const patientId = "6f6073d3-0ba8-4bf4-943d-f819df3d4f31";

describe("recall schemas", () => {
  it("normalizes optional recall fields", () => {
    const parsed = saveRecallSchema.parse({
      patientId,
      doctorId: "",
      recallType: "hygiene",
      dueDate: "2026-10-20",
      notes: "",
    });

    expect(parsed.doctorId).toBeUndefined();
    expect(parsed.notes).toBeUndefined();
  });

  it("rejects impossible dates", () => {
    expect(saveRecallSchema.safeParse({
      patientId,
      recallType: "control_visit",
      dueDate: "2026-02-31",
    }).success).toBe(false);
  });

  it("falls back safely for invalid filters", () => {
    const parsed = recallFiltersSchema.parse({ status: "broken", due: "today" });
    expect(parsed.status).toBeUndefined();
    expect(parsed.due).toBe("today");
  });
});
