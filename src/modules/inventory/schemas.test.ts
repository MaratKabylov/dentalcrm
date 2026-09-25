import { describe, expect, it } from "vitest";

import { recordCorrectionSchema, recordOutflowSchema, recordReceiptSchema } from "./schemas";

const id = "6f6073d3-0ba8-4bf4-943d-f819df3d4f31";

describe("inventory schemas", () => {
  it("normalizes optional receipt fields", () => {
    const parsed = recordReceiptSchema.parse({ warehouseId: id, itemId: id, quantity: "2.5", unitCost: "120", lotNumber: "", expirationDate: "", note: "" });
    expect(parsed.quantity).toBe(2.5);
    expect(parsed.lotNumber).toBeUndefined();
    expect(parsed.expirationDate).toBeUndefined();
  });

  it("requires a reason for write-off", () => {
    expect(recordOutflowSchema.safeParse({ batchId: id, movementType: "write_off", quantity: "1", note: "" }).success).toBe(false);
    expect(recordOutflowSchema.safeParse({ batchId: id, movementType: "issue", quantity: "1", note: "" }).success).toBe(true);
  });

  it("accepts signed non-zero corrections", () => {
    expect(recordCorrectionSchema.parse({ batchId: id, quantity: "-1.25", reason: "Инвентаризация" }).quantity).toBe(-1.25);
    expect(recordCorrectionSchema.safeParse({ batchId: id, quantity: "0", reason: "Инвентаризация" }).success).toBe(false);
  });
});
