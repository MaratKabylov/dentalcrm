import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalUuid = z.preprocess(emptyToUndefined, z.uuid().optional());
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите корректную дату.").refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Укажите существующую дату.");

export const recallTypeSchema = z.enum([
  "hygiene",
  "control_visit",
  "orthodontics",
  "implant_check",
  "unfinished_treatment",
  "other",
]);

export const recallStatusSchema = z.enum([
  "scheduled",
  "due",
  "contacted",
  "booked",
  "completed",
  "cancelled",
]);

export const saveRecallSchema = z.object({
  recallId: optionalUuid,
  patientId: z.uuid("Выберите пациента."),
  doctorId: optionalUuid,
  recallType: recallTypeSchema,
  dueDate: isoDateSchema,
  notes: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(5000, "Комментарий слишком длинный.").optional(),
  ),
});

export const setRecallStatusSchema = z.object({
  recallId: z.uuid(),
  status: recallStatusSchema,
});

export const recallFiltersSchema = z.object({
  q: z.string().trim().max(200).catch(""),
  status: z.preprocess(
    emptyToUndefined,
    z.union([recallStatusSchema, z.literal("all"), z.literal("active")]).optional(),
  ).catch(undefined),
  type: z.preprocess(
    emptyToUndefined,
    z.union([recallTypeSchema, z.literal("all")]).optional(),
  ).catch(undefined),
  doctor: optionalUuid.catch(undefined),
  due: z.preprocess(
    emptyToUndefined,
    z.enum(["all", "overdue", "today", "upcoming"]).optional(),
  ).catch(undefined),
});

export const recallDefaultsSchema = z.object({
  patientId: optionalUuid,
});
