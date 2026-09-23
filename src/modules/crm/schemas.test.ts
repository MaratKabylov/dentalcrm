import { describe, expect, it } from "vitest";

import { addLeadActivitySchema, saveLeadSchema, savePatientSourceSchema } from "./schemas";

const sourceId = "6f6073d3-0ba8-4bf4-943d-f819df3d4f31";

describe("CRM schemas", () => {
  it("normalizes optional lead fields", () => {
    const parsed = saveLeadSchema.parse({
      leadId: "",
      branchId: "",
      fullName: "  Айгуль Серикова  ",
      phone: "+7 700 000 00 00",
      email: "",
      sourceId,
      assignedTo: "",
      notes: "",
    });

    expect(parsed.fullName).toBe("Айгуль Серикова");
    expect(parsed.email).toBeUndefined();
    expect(parsed.branchId).toBeUndefined();
  });

  it("rejects invalid phone and source code", () => {
    expect(saveLeadSchema.safeParse({ fullName: "Тест", phone: "12" }).success).toBe(false);
    expect(savePatientSourceSchema.safeParse({
      code: "Наружная реклама",
      name: "Наружная реклама",
      color: "#EA580C",
      sortOrder: 10,
    }).success).toBe(false);
  });

  it("requires an activity body", () => {
    expect(addLeadActivitySchema.safeParse({
      leadId: sourceId,
      type: "call",
      body: "   ",
    }).success).toBe(false);
  });
});
