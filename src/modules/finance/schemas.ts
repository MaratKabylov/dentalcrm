import { z } from "zod";

export const createInvoiceFromEncounterSchema = z.object({
  encounterId: z.uuid(),
});

export const invoiceIdSchema = z.uuid();

export const openCashShiftSchema = z.object({
  cashDeskId: z.uuid(),
  openingBalance: z.coerce.number().min(0).max(999999999999.99),
});

export const closeCashShiftSchema = z.object({
  shiftId: z.uuid(),
  closingBalance: z.coerce.number().min(0).max(999999999999.99),
});

export const recordInvoicePaymentSchema = z.object({
  invoiceId: z.uuid(),
  cashShiftId: z.uuid("Выберите открытую кассовую смену."),
  paymentMethodId: z.uuid("Выберите способ оплаты."),
  amount: z.coerce.number().positive("Сумма должна быть больше нуля.").max(999999999999.99),
  externalReference: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(200).optional(),
  ),
});

const paymentReasonSchema = z.string().trim()
  .min(3, "Укажите причину — минимум 3 символа.")
  .max(500, "Причина не должна превышать 500 символов.");

export const reversePaymentSchema = z.object({
  paymentId: z.uuid(),
  reason: paymentReasonSchema,
});

export const recordPaymentRefundSchema = z.object({
  paymentId: z.uuid(),
  cashShiftId: z.uuid("Выберите открытую кассовую смену."),
  paymentMethodId: z.uuid("Выберите способ возврата."),
  amount: z.coerce.number()
    .positive("Сумма должна быть больше нуля.")
    .max(999999999999.99)
    .multipleOf(0.01, "Укажите сумму с точностью до тиына."),
  reason: paymentReasonSchema,
  externalReference: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(200).optional(),
  ),
});
