import { describe, expect, it } from "vitest";

import {
  applyInvoiceDiscountSchema,
  closeCashShiftSchema,
  createDiscountDefinitionSchema,
  createInvoiceFromEncounterSchema,
  debtFiltersSchema,
  openCashShiftSchema,
  recordInvoicePaymentSchema,
  recordPaymentRefundSchema,
  reversePaymentSchema,
  setDiscountRoleLimitSchema,
} from "./schemas";

describe("createInvoiceFromEncounterSchema", () => {
  it("accepts an encounter UUID", () => {
    expect(createInvoiceFromEncounterSchema.safeParse({
      encounterId: "6f6073d3-0ba8-4bf4-943d-f819df3d4f31",
    }).success).toBe(true);
  });

  it("rejects an arbitrary encounter reference", () => {
    expect(createInvoiceFromEncounterSchema.safeParse({ encounterId: "encounter-1" }).success).toBe(false);
  });
});

describe("payment correction schemas", () => {
  const id = "6f6073d3-0ba8-4bf4-943d-f819df3d4f31";

  it("requires a meaningful reversal reason", () => {
    expect(reversePaymentSchema.safeParse({ paymentId: id, reason: "Ошибочная оплата" }).success).toBe(true);
    expect(reversePaymentSchema.safeParse({ paymentId: id, reason: "  " }).success).toBe(false);
  });

  it("validates a refund with two-decimal precision", () => {
    expect(recordPaymentRefundSchema.safeParse({
      paymentId: id,
      cashShiftId: id,
      paymentMethodId: id,
      amount: "1250.50",
      reason: "Возврат пациенту",
      externalReference: "REF-123",
    }).success).toBe(true);
    expect(recordPaymentRefundSchema.safeParse({
      paymentId: id,
      cashShiftId: id,
      paymentMethodId: id,
      amount: "10.001",
      reason: "Возврат пациенту",
    }).success).toBe(false);
  });
});

describe("discount schemas", () => {
  const id = "6f6073d3-0ba8-4bf4-943d-f819df3d4f31";

  it("validates percentage and fixed definitions", () => {
    expect(createDiscountDefinitionSchema.safeParse({ name: "Лояльность", type: "percentage", value: "10" }).success).toBe(true);
    expect(createDiscountDefinitionSchema.safeParse({ name: "Сертификат", type: "fixed", value: "5000" }).success).toBe(true);
    expect(createDiscountDefinitionSchema.safeParse({ name: "Ошибка", type: "percentage", value: "101" }).success).toBe(false);
  });

  it("validates role limits and discount reasons", () => {
    expect(setDiscountRoleLimitSchema.safeParse({ roleId: id, maxDiscountPercent: "20" }).success).toBe(true);
    expect(setDiscountRoleLimitSchema.safeParse({ roleId: id, maxDiscountPercent: "100.01" }).success).toBe(false);
    expect(applyInvoiceDiscountSchema.safeParse({ invoiceId: id, discountId: id, reason: "Программа лояльности" }).success).toBe(true);
    expect(applyInvoiceDiscountSchema.safeParse({ invoiceId: id, discountId: id, reason: "" }).success).toBe(false);
  });
});

describe("debtFiltersSchema", () => {
  it("normalizes empty debt filters", () => {
    expect(debtFiltersSchema.parse({ q: "", branch: "", bucket: "all" })).toEqual({
      q: "",
      branch: undefined,
      bucket: "all",
    });
  });

  it("rejects unknown aging buckets", () => {
    expect(debtFiltersSchema.safeParse({ bucket: "overdue" }).success).toBe(false);
  });
});

describe("cash desk schemas", () => {
  const id = "6f6073d3-0ba8-4bf4-943d-f819df3d4f31";

  it("accepts non-negative shift balances", () => {
    expect(openCashShiftSchema.safeParse({ cashDeskId: id, openingBalance: "0" }).success).toBe(true);
    expect(closeCashShiftSchema.safeParse({ shiftId: id, closingBalance: "125000.50" }).success).toBe(true);
  });

  it("validates a positive invoice payment", () => {
    expect(recordInvoicePaymentSchema.safeParse({
      invoiceId: id,
      cashShiftId: id,
      paymentMethodId: id,
      amount: "10000",
      externalReference: "KASPI-123",
    }).success).toBe(true);
    expect(recordInvoicePaymentSchema.safeParse({
      invoiceId: id,
      cashShiftId: id,
      paymentMethodId: id,
      amount: "0",
      externalReference: "",
    }).success).toBe(false);
  });
});
