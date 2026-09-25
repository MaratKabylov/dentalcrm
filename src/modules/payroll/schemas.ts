import { z } from "zod";

const emptyToUndefined = (value: unknown) => typeof value === "string" && value.trim() === "" ? undefined : value;
const optionalUuid = z.preprocess(emptyToUndefined, z.uuid().optional());
const optionalDate = z.preprocess(emptyToUndefined, z.iso.date().optional());

export const compensationPeriodSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
}).refine((value) => value.to >= value.from, { path: ["to"], message: "Конец периода не может быть раньше начала." })
  .refine((value) => (Date.parse(value.to) - Date.parse(value.from)) / 86_400_000 <= 366, { path: ["to"], message: "Период не должен превышать 367 дней." });

export const saveCompensationRuleSchema = z.object({
  employeeId: optionalUuid,
  serviceId: optionalUuid,
  categoryId: optionalUuid,
  ruleType: z.enum(["percent_revenue", "fixed_per_service", "percent_margin"]),
  value: z.coerce.number().min(0, "Значение не может быть отрицательным.").max(999999999),
  validFrom: z.iso.date(),
  validTo: optionalDate,
}).superRefine((value, context) => {
  if (value.serviceId && value.categoryId) context.addIssue({ code: "custom", path: ["serviceId"], message: "Выберите услугу или категорию, но не обе." });
  if (value.validTo && value.validTo < value.validFrom) context.addIssue({ code: "custom", path: ["validTo"], message: "Дата окончания раньше даты начала." });
  if (value.ruleType !== "fixed_per_service" && value.value > 100) context.addIssue({ code: "custom", path: ["value"], message: "Процент не может превышать 100." });
});

export const closeCompensationRuleSchema = z.object({ ruleId: z.uuid(), closingDate: z.iso.date() });
export const postCompensationEntriesSchema = compensationPeriodSchema;
