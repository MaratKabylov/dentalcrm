import { describe, expect, it } from "vitest";

import { compensationPeriodSchema, saveCompensationRuleSchema } from "./schemas";

const id = "6f6073d3-0ba8-4bf4-943d-f819df3d4f31";

describe("payroll schemas", () => {
  it("accepts a global percentage rule", () => {
    expect(saveCompensationRuleSchema.parse({ employeeId: "", serviceId: "", categoryId: "", ruleType: "percent_revenue", value: "35", validFrom: "2026-09-01", validTo: "" })).toMatchObject({ ruleType: "percent_revenue", value: 35 });
  });

  it("rejects ambiguous service scope and excessive percentages", () => {
    expect(saveCompensationRuleSchema.safeParse({ employeeId: id, serviceId: id, categoryId: id, ruleType: "percent_margin", value: "101", validFrom: "2026-09-01" }).success).toBe(false);
  });

  it("rejects reversed periods", () => {
    expect(compensationPeriodSchema.safeParse({ from: "2026-09-25", to: "2026-09-01" }).success).toBe(false);
  });
});
