import { describe, expect, it } from "vitest";

import { treatmentPlanItemsSchema } from "./schemas";

const serviceId = "6f6073d3-0ba8-4bf4-943d-f819df3d4f31";

describe("treatmentPlanItemsSchema", () => {
  const item = {
    serviceId,
    toothCode: "11" as const,
    quantity: 1,
    unitPrice: 10000,
    discountAmount: 1000,
    priority: 2,
    plannedOrder: 1,
    notes: null,
  };

  it("accepts a valid treatment item", () => {
    expect(treatmentPlanItemsSchema.safeParse([item]).success).toBe(true);
  });

  it("rejects a discount above gross amount", () => {
    expect(treatmentPlanItemsSchema.safeParse([{ ...item, discountAmount: 11000 }]).success).toBe(false);
  });

  it("rejects duplicate planned order", () => {
    expect(treatmentPlanItemsSchema.safeParse([item, { ...item }]).success).toBe(false);
  });
});
