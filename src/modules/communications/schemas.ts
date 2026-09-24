import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const optionalUuid = z.preprocess(emptyToUndefined, z.uuid().optional());
const optionalText = (max: number) => z.preprocess(
  emptyToUndefined,
  z.string().trim().max(max).optional(),
);

export const communicationChannelSchema = z.enum(["sms", "whatsapp", "telegram", "email", "push"]);
export const communicationDirectionSchema = z.enum(["inbound", "outbound"]);
export const communicationStatusSchema = z.enum([
  "queued",
  "sending",
  "sent",
  "delivered",
  "failed",
  "received",
  "cancelled",
]);
export const communicationTemplateCategorySchema = z.enum([
  "general",
  "appointment",
  "recall",
  "marketing",
]);
export const communicationTargetTypeSchema = z.enum(["patient", "lead"]);

export const saveCommunicationTemplateSchema = z.object({
  templateId: optionalUuid,
  name: z.string().trim().min(2, "Укажите название шаблона.").max(160),
  category: communicationTemplateCategorySchema,
  channel: z.preprocess(emptyToUndefined, communicationChannelSchema.optional()),
  subject: optionalText(240),
  body: z.string().trim().min(1, "Добавьте текст шаблона.").max(5000),
});

export const setCommunicationTemplateActiveSchema = z.object({
  templateId: z.uuid(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const queueCommunicationSchema = z.object({
  targetType: communicationTargetTypeSchema,
  targetId: z.uuid("Выберите получателя."),
  channel: communicationChannelSchema,
  recipient: z.string().trim().min(2, "Укажите адрес получателя.").max(320),
  subject: optionalText(240),
  body: z.string().trim().min(1, "Добавьте текст сообщения.").max(5000),
  templateId: optionalUuid,
}).superRefine((value, context) => {
  if (value.channel === "email" && !z.email().safeParse(value.recipient).success) {
    context.addIssue({ code: "custom", path: ["recipient"], message: "Укажите корректный email." });
  }
  if (/{{\s*[a-z][a-z0-9_]*\s*}}/i.test(value.body)) {
    context.addIssue({
      code: "custom",
      path: ["body"],
      message: "Заполните все переменные шаблона перед постановкой в очередь.",
    });
  }
  if (value.subject && /{{\s*[a-z][a-z0-9_]*\s*}}/i.test(value.subject)) {
    context.addIssue({
      code: "custom",
      path: ["subject"],
      message: "Заполните все переменные темы перед постановкой в очередь.",
    });
  }
});

export const communicationFiltersSchema = z.object({
  q: z.string().trim().max(200).catch(""),
  channel: z.preprocess(
    emptyToUndefined,
    z.union([communicationChannelSchema, z.literal("all")]).optional(),
  ).catch(undefined),
  direction: z.preprocess(
    emptyToUndefined,
    z.union([communicationDirectionSchema, z.literal("all")]).optional(),
  ).catch(undefined),
  status: z.preprocess(
    emptyToUndefined,
    z.union([communicationStatusSchema, z.literal("all")]).optional(),
  ).catch(undefined),
});

export const communicationDefaultsSchema = z.object({
  patientId: optionalUuid,
  leadId: optionalUuid,
}).transform((value) => {
  if (value.patientId) return { type: "patient" as const, id: value.patientId };
  if (value.leadId) return { type: "lead" as const, id: value.leadId };
  return { type: undefined, id: undefined };
});
