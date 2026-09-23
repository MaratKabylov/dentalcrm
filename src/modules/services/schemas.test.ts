import { describe, expect, it } from "vitest";

import { saveServiceCategorySchema, saveServiceSchema } from "./schemas";

const categoryId = "6f6073d3-0ba8-4bf4-943d-f819df3d4f31";

describe("treatment catalog schemas", () => {
  it("normalizes optional financial values", () => {
    const parsed = saveServiceSchema.parse({
      serviceId: "",
      categoryId,
      code: "CONSULT",
      name: "Консультация",
      durationMinutes: "30",
      basePrice: "5000",
      costPrice: "",
      vatRate: "",
    });

    expect(parsed.costPrice).toBeUndefined();
    expect(parsed.vatRate).toBeUndefined();
    expect(parsed.basePrice).toBe(5000);
  });

  it("rejects negative prices", () => {
    const result = saveServiceSchema.safeParse({
      categoryId,
      code: "TEST",
      name: "Тестовая услуга",
      durationMinutes: 30,
      basePrice: -1,
      costPrice: "",
      vatRate: "",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a root category", () => {
    const result = saveServiceCategorySchema.safeParse({
      categoryId: "",
      parentId: "",
      name: "Терапия",
      sortOrder: "100",
    });

    expect(result.success).toBe(true);
  });
});
