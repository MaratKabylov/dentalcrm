import { describe, expect, it } from "vitest";

import {
  addLeadActivitySchema,
  convertLeadSchema,
  saveLeadSchema,
  saveMarketingCampaignSchema,
  savePatientSourceSchema,
} from "./schemas";

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

  it("normalizes campaign values and validates its period", () => {
    const campaign = saveMarketingCampaignSchema.parse({
      sourceId,
      branchId: "",
      name: "  Google Имплантация  ",
      code: "GOOGLE-IMPLANT-Q4",
      utmSource: " google ",
      utmMedium: "",
      utmCampaign: "implant_q4",
      budgetAmount: "250000.50",
      startsOn: "2026-09-01",
      endsOn: "2026-12-31",
      isActive: "true",
    });

    expect(campaign.code).toBe("google-implant-q4");
    expect(campaign.utmMedium).toBeUndefined();
    expect(campaign.budgetAmount).toBe(250000.5);
    expect(saveMarketingCampaignSchema.safeParse({ ...campaign, isActive: "true", startsOn: "2026-12-31", endsOn: "2026-09-01" }).success).toBe(false);
  });

  it("requires valid lead and patient ids for conversion", () => {
    expect(convertLeadSchema.safeParse({ leadId: sourceId, patientId: sourceId }).success).toBe(true);
    expect(convertLeadSchema.safeParse({ leadId: sourceId, patientId: "patient" }).success).toBe(false);
  });
});
