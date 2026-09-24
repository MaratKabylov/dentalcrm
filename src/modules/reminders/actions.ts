"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import { requirePermission } from "@/modules/organizations/repository";
import {
  saveAutomationRuleSchema,
  setAutomationRuleActiveSchema,
} from "@/modules/reminders/schemas";

export async function saveAutomationRule(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("automation.manage");
  const parsed = saveAutomationRuleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте параметры правила.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_automation_rule", {
    org_id: context.organization.id,
    target_rule_id: parsed.data.ruleId ?? null,
    rule_name: parsed.data.name,
    rule_event_code: parsed.data.eventCode,
    rule_channel: parsed.data.channel,
    rule_template_id: parsed.data.templateId,
  });
  if (error) {
    return {
      status: "error",
      message: error.code === "23505"
        ? "Правило с таким названием уже существует."
        : "Не удалось сохранить правило. Проверьте, что шаблон активен и подходит каналу.",
    };
  }
  revalidatePath("/crm/reminders");
  return { status: "success", message: "Правило сохранено." };
}

export async function setAutomationRuleActive(formData: FormData) {
  const context = await requirePermission("automation.manage");
  const parsed = setAutomationRuleActiveSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_automation_rule_active", {
    org_id: context.organization.id,
    target_rule_id: parsed.ruleId,
    target_is_active: parsed.isActive,
  });
  if (error) throw new Error("Не удалось изменить активность правила.");
  revalidatePath("/crm/reminders");
}

export async function runReminderAutomation(
  _state: FormActionState,
  _formData: FormData,
): Promise<FormActionState> {
  void _state;
  void _formData;
  const context = await requirePermission("automation.manage");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("run_reminder_automation", {
    org_id: context.organization.id,
  });
  if (error) return { status: "error", message: "Не удалось обработать напоминания." };
  const result = Array.isArray(data) ? data[0] : null;
  const generated = Number(result?.generated_count ?? 0);
  const queued = Number(result?.queued_count ?? 0);
  const skipped = Number(result?.skipped_count ?? 0);
  const failed = Number(result?.failed_count ?? 0);
  revalidatePath("/crm/reminders");
  revalidatePath("/crm/communications");
  return {
    status: failed > 0 ? "error" : "success",
    message: `Создано заданий: ${generated}. В очередь сообщений: ${queued}. Пропущено: ${skipped}. Ошибок: ${failed}.`,
  };
}
