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

export const createDiscountDefinitionSchema = z.object({
  name: z.string().trim().min(2, "Название должно содержать минимум 2 символа.").max(120),
  type: z.enum(["percentage", "fixed"]),
  value: z.coerce.number()
    .positive("Значение должно быть больше нуля.")
    .max(999999999999.99)
    .multipleOf(0.01, "Укажите значение с точностью до сотых."),
}).refine((discount) => discount.type !== "percentage" || discount.value <= 100, {
  path: ["value"],
  message: "Процентная скидка не может превышать 100%.",
});

export const setDiscountDefinitionActiveSchema = z.object({
  discountId: z.uuid(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const setDiscountRoleLimitSchema = z.object({
  roleId: z.uuid(),
  maxDiscountPercent: z.coerce.number()
    .min(0, "Лимит не может быть отрицательным.")
    .max(100, "Лимит не может превышать 100%.")
    .multipleOf(0.01, "Укажите лимит с точностью до сотых."),
});

export const applyInvoiceDiscountSchema = z.object({
  invoiceId: z.uuid(),
  discountId: z.uuid("Выберите скидку."),
  reason: paymentReasonSchema,
});

export const debtAgingBucketSchema = z.enum(["all", "0_7", "8_30", "31_60", "61_90", "91_plus"]);

export const debtFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().default(""),
  branch: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.uuid().optional(),
  ),
  bucket: debtAgingBucketSchema.optional().default("all"),
});
