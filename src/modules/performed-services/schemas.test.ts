import { describe, expect, it } from "vitest";

import { addPerformedServiceSchema, voidPerformedServiceSchema } from "./schemas";

const encounterId = "6f6073d3-0ba8-4bf4-943d-f819df3d4f31";
const serviceId = "a75eb15e-69c3-443a-a583-879067b4fdcb";
const treatmentPlanItemId = "40163153-a236-4603-a3aa-603f110badc5";

describe("addPerformedServiceSchema", () => {
  it("accepts a catalog service", () => {
    const result = addPerformedServiceSchema.safeParse({
      encounterId,
      serviceId,
      treatmentPlanItemId: "",
      toothCode: "11",
      quantity: "1.5",
      discountAmount: "500",
      notes: "Выполнено без осложнений",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a treatment plan item without a repeated service id", () => {
    const result = addPerformedServiceSchema.safeParse({
      encounterId,
      serviceId: "",
      treatmentPlanItemId,
      toothCode: "",
      quantity: "1",
      discountAmount: "0",
      notes: "",
    });

    expect(result.success).toBe(true);
  });

  it("requires a source and valid quantity", () => {
    const result = addPerformedServiceSchema.safeParse({
      encounterId,
      serviceId: "",
      treatmentPlanItemId: "",
      toothCode: "99",
      quantity: "0",
      discountAmount: "-1",
      notes: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("voidPerformedServiceSchema", () => {
  it("requires a meaningful reason", () => {
    expect(voidPerformedServiceSchema.safeParse({
      performedServiceId: serviceId,
      encounterId,
      reason: "",
    }).success).toBe(false);
  });
});
