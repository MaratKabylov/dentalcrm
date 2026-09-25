"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import { requirePermission } from "@/modules/organizations/repository";
import { closeCompensationRuleSchema, postCompensationEntriesSchema, saveCompensationRuleSchema } from "./schemas";

export async function saveCompensationRule(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  const context = await requirePermission("payroll.manage");
  const parsed = saveCompensationRuleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Проверьте параметры правила.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_compensation_rule", { org_id: context.organization.id, target_employee_id: parsed.data.employeeId ?? null, target_service_id: parsed.data.serviceId ?? null, target_category_id: parsed.data.categoryId ?? null, target_rule_type: parsed.data.ruleType, target_value: parsed.data.value, target_valid_from: parsed.data.validFrom, target_valid_to: parsed.data.validTo ?? null });
  if (error) return { status: "error", message: error.message.includes("Overlapping") ? "Для этой области уже есть ставка в выбранном периоде." : "Не удалось сохранить правило начисления." };
  revalidatePath("/finance/payroll");
  return { status: "success", message: "Новая версия правила сохранена." };
}

export async function closeCompensationRule(formData: FormData) {
  const context = await requirePermission("payroll.manage");
  const parsed = closeCompensationRuleSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_compensation_rule", { org_id: context.organization.id, target_rule_id: parsed.ruleId, closing_date: parsed.closingDate });
  if (error) throw new Error("Не удалось завершить действие ставки.");
  revalidatePath("/finance/payroll");
}

export async function postCompensationEntries(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  const context = await requirePermission("payroll.manage");
  const parsed = postCompensationEntriesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Проверьте расчётный период.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_compensation_entries", { org_id: context.organization.id, report_start: parsed.data.from, report_end: parsed.data.to });
  if (error) return { status: "error", message: "Не удалось зафиксировать начисления. Проверьте, что для услуг настроены ставки." };
  revalidatePath("/finance/payroll");
  revalidatePath("/analytics/doctors");
  return { status: "success", message: `Зафиксировано новых начислений: ${Number(data ?? 0)}.` };
}
