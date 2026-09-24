import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { communicationChannelSchema } from "@/modules/communications/schemas";
import { requirePermission } from "@/modules/organizations/repository";
import { reminderEventCodeSchema, reminderJobStatusSchema } from "@/modules/reminders/schemas";
import type { AutomationRule, ReminderJob, ReminderSummary } from "@/modules/reminders/types";

const ruleRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  event_code: reminderEventCodeSchema,
  channel: communicationChannelSchema,
  template_id: z.uuid(),
  template_name: z.string(),
  is_active: z.boolean(),
  updated_at: z.string(),
});

const jobRowSchema = z.object({
  id: z.uuid(),
  rule_name: z.string(),
  event_code: reminderEventCodeSchema,
  channel: communicationChannelSchema,
  status: reminderJobStatusSchema,
  patient_id: z.uuid(),
  patient_name: z.string(),
  appointment_id: z.uuid().nullable(),
  recall_id: z.uuid().nullable(),
  scheduled_for: z.string(),
  error_message: z.string().nullable(),
  created_at: z.string(),
});

const summaryRowSchema = z.object({
  active_rules: z.coerce.number().int().nonnegative(),
  pending_jobs: z.coerce.number().int().nonnegative(),
  due_jobs: z.coerce.number().int().nonnegative(),
  failed_jobs: z.coerce.number().int().nonnegative(),
});

export async function listAutomationRules(): Promise<AutomationRule[]> {
  const context = await requirePermission("automation.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_automation_rules", {
    org_id: context.organization.id,
  });
  if (error) throw new AppError("AUTOMATION_RULES_LOAD_FAILED", "Не удалось загрузить правила напоминаний.");
  const parsed = z.array(ruleRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_AUTOMATION_RULE_DATA", "Получены некорректные правила напоминаний.");
  return parsed.data.map((row) => ({
    id: row.id,
    name: row.name,
    eventCode: row.event_code,
    channel: row.channel,
    templateId: row.template_id,
    templateName: row.template_name,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  }));
}

export async function listReminderJobs(): Promise<ReminderJob[]> {
  const context = await requirePermission("automation.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_reminder_jobs", {
    org_id: context.organization.id,
    result_limit: 100,
  });
  if (error) throw new AppError("REMINDER_JOBS_LOAD_FAILED", "Не удалось загрузить задания напоминаний.");
  const parsed = z.array(jobRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_REMINDER_JOB_DATA", "Получены некорректные задания напоминаний.");
  return parsed.data.map((row) => ({
    id: row.id,
    ruleName: row.rule_name,
    eventCode: row.event_code,
    channel: row.channel,
    status: row.status,
    patientId: row.patient_id,
    patientName: row.patient_name,
    appointmentId: row.appointment_id,
    recallId: row.recall_id,
    scheduledFor: row.scheduled_for,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  }));
}

export async function getReminderSummary(): Promise<ReminderSummary> {
  const context = await requirePermission("automation.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_reminder_summary", {
    org_id: context.organization.id,
  });
  if (error) throw new AppError("REMINDER_SUMMARY_LOAD_FAILED", "Не удалось загрузить сводку напоминаний.");
  const parsed = z.array(summaryRowSchema).safeParse(data ?? []);
  if (!parsed.success || !parsed.data[0]) {
    throw new AppError("INVALID_REMINDER_SUMMARY_DATA", "Получена некорректная сводка напоминаний.");
  }
  return {
    activeRules: parsed.data[0].active_rules,
    pendingJobs: parsed.data[0].pending_jobs,
    dueJobs: parsed.data[0].due_jobs,
    failedJobs: parsed.data[0].failed_jobs,
  };
}
