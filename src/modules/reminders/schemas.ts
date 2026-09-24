import { z } from "zod";

import { communicationChannelSchema } from "../communications/schemas";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const reminderEventCodeSchema = z.enum([
  "appointment_booked",
  "appointment_before_24h",
  "appointment_before_2h",
  "appointment_no_show",
  "appointment_completed",
  "recall_due",
]);

export const reminderJobStatusSchema = z.enum(["pending", "queued", "skipped", "failed"]);

export const saveAutomationRuleSchema = z.object({
  ruleId: z.preprocess(emptyToUndefined, z.uuid().optional()),
  name: z.string().trim().min(2, "Укажите название правила.").max(160),
  eventCode: reminderEventCodeSchema,
  channel: communicationChannelSchema,
  templateId: z.uuid("Выберите шаблон."),
});

export const setAutomationRuleActiveSchema = z.object({
  ruleId: z.uuid(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});
