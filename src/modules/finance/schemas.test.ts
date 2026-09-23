import { describe, expect, it } from "vitest";

import {
  closeCashShiftSchema,
  createInvoiceFromEncounterSchema,
  openCashShiftSchema,
  recordInvoicePaymentSchema,
  recordPaymentRefundSchema,
  reversePaymentSchema,
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
