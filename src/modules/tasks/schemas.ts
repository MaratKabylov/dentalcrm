import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalUuid = z.preprocess(emptyToUndefined, z.uuid().optional());

export const taskStatusSchema = z.enum(["todo", "in_progress", "done", "cancelled"]);
export const taskPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export const taskRelationTypeSchema = z.enum(["lead", "patient"]);

export const saveTaskSchema = z.object({
  taskId: optionalUuid,
  branchId: optionalUuid,
  title: z.string().trim().min(2, "Укажите название задачи.").max(240),
  description: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(5000, "Описание слишком длинное.").optional(),
  ),
  priority: taskPrioritySchema,
  assignedTo: optionalUuid,
  dueDate: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите корректную дату.").optional(),
  ),
  dueTime: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Укажите корректное время.").optional(),
  ),
  relatedEntityType: z.preprocess(emptyToUndefined, taskRelationTypeSchema.optional()),
  relatedEntityId: optionalUuid,
}).superRefine((value, context) => {
  if (Boolean(value.dueDate) !== Boolean(value.dueTime)) {
    context.addIssue({
      code: "custom",
      path: value.dueDate ? ["dueTime"] : ["dueDate"],
      message: "Дата и время срока указываются вместе.",
    });
  }
  if (Boolean(value.relatedEntityType) !== Boolean(value.relatedEntityId)) {
    context.addIssue({
      code: "custom",
      path: ["relatedEntityId"],
      message: "Выберите связанную запись.",
    });
  }
});

export const setTaskStatusSchema = z.object({
  taskId: z.uuid(),
  status: taskStatusSchema,
});

export const taskFiltersSchema = z.object({
  q: z.string().trim().max(200).catch(""),
  status: z.preprocess(
    emptyToUndefined,
    z.union([taskStatusSchema, z.literal("all"), z.literal("open")]).optional(),
  ).catch(undefined),
  priority: z.preprocess(
    emptyToUndefined,
    z.union([taskPrioritySchema, z.literal("all")]).optional(),
  ).catch(undefined),
  assignee: optionalUuid.catch(undefined),
  due: z.preprocess(
    emptyToUndefined,
    z.enum(["all", "overdue", "today", "no_due"]).optional(),
  ).catch(undefined),
});

export const taskRelationDefaultsSchema = z.object({
  leadId: optionalUuid,
  patientId: optionalUuid,
}).transform((value) => {
  if (value.leadId) return { type: "lead" as const, id: value.leadId };
  if (value.patientId) return { type: "patient" as const, id: value.patientId };
  return { type: undefined, id: undefined };
});
