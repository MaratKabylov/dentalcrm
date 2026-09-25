import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalUuid = z.preprocess(emptyToUndefined, z.uuid().optional());
const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

export const leadStatusSchema = z.enum([
  "new",
  "contacted",
  "appointment_booked",
  "thinking",
  "lost",
  "converted",
]);

export const editableLeadStatusSchema = z.enum([
  "new",
  "contacted",
  "appointment_booked",
  "thinking",
  "lost",
]);

export const saveLeadSchema = z.object({
  leadId: optionalUuid,
  branchId: optionalUuid,
  fullName: z.string().trim().min(2, "Укажите имя лида.").max(200),
  phone: z.string().trim().refine(
    (value) => value.replace(/\D/g, "").length >= 5,
    "Укажите корректный телефон.",
  ).refine(
    (value) => value.replace(/\D/g, "").length <= 15,
    "В телефоне слишком много цифр.",
  ),
  email: z.preprocess(
    emptyToUndefined,
    z.email("Укажите корректный email.").max(254).optional(),
  ),
  sourceId: optionalUuid,
  campaignId: optionalUuid,
  assignedTo: optionalUuid,
  notes: optionalText(5000),
  utmSource: optionalText(120),
  utmMedium: optionalText(120),
  utmCampaign: optionalText(160),
  utmContent: optionalText(160),
  utmTerm: optionalText(160),
  landingPage: z.preprocess(
    emptyToUndefined,
    z.url("Укажите корректный URL посадочной страницы.").max(500).optional(),
  ),
});

export const saveMarketingCampaignSchema = z.object({
  campaignId: optionalUuid,
  sourceId: z.uuid("Выберите источник."),
  branchId: optionalUuid,
  name: z.string().trim().min(2, "Укажите название кампании.").max(160),
  code: z.string().trim().toLowerCase().regex(
    /^[a-z0-9_-]{2,60}$/,
    "Используйте латинские буквы, цифры, дефис или подчёркивание.",
  ),
  utmSource: optionalText(120),
  utmMedium: optionalText(120),
  utmCampaign: optionalText(160),
  budgetAmount: z.coerce.number().min(0).max(999999999999.99),
  startsOn: z.iso.date("Укажите дату начала."),
  endsOn: z.preprocess(emptyToUndefined, z.iso.date().optional()),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
}).refine(
  (value) => !value.endsOn || value.endsOn >= value.startsOn,
  { path: ["endsOn"], message: "Дата окончания не может быть раньше даты начала." },
);

export const setMarketingCampaignActiveSchema = z.object({
  campaignId: z.uuid(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const convertLeadSchema = z.object({
  leadId: z.uuid(),
  patientId: z.uuid("Выберите пациента."),
});

export const savePatientSourceSchema = z.object({
  sourceId: optionalUuid,
  code: z.string().trim().toLowerCase().regex(
    /^[a-z0-9_]{2,40}$/,
    "Используйте латинские буквы, цифры и подчёркивание.",
  ),
  name: z.string().trim().min(2, "Укажите название.").max(120),
  color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, "Укажите HEX-цвет."),
  sortOrder: z.coerce.number().int().min(0).max(10000),
});

export const setPatientSourceActiveSchema = z.object({
  sourceId: z.uuid(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const setLeadStatusSchema = z.object({
  leadId: z.uuid(),
  status: editableLeadStatusSchema,
});

export const addLeadActivitySchema = z.object({
  leadId: z.uuid(),
  type: z.enum(["note", "call", "email", "message"]),
  body: z.string().trim().min(1, "Добавьте описание контакта.").max(5000),
});

export const leadFiltersSchema = z.object({
  q: z.string().trim().max(200).catch(""),
  status: z.preprocess(
    emptyToUndefined,
    z.union([leadStatusSchema, z.literal("all")]).optional(),
  ).catch(undefined),
  source: optionalUuid.catch(undefined),
  branch: optionalUuid.catch(undefined),
});

export const marketingReportFiltersSchema = z.object({
  from: z.iso.date().catch(""),
  to: z.iso.date().catch(""),
  source: optionalUuid.catch(undefined),
  branch: optionalUuid.catch(undefined),
});
