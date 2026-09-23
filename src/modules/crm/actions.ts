"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import {
  addLeadActivitySchema,
  saveLeadSchema,
  savePatientSourceSchema,
  setLeadStatusSchema,
  setPatientSourceActiveSchema,
} from "@/modules/crm/schemas";
import { requirePermission } from "@/modules/organizations/repository";

export async function saveLead(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("crm.manage");
  const parsed = saveLeadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Проверьте данные лида.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_lead", {
    org_id: context.organization.id,
    target_lead_id: parsed.data.leadId ?? null,
    lead_branch_id: parsed.data.branchId ?? null,
    lead_full_name: parsed.data.fullName,
    lead_phone: parsed.data.phone,
    lead_email: parsed.data.email ?? null,
    lead_source_id: parsed.data.sourceId ?? null,
    lead_assigned_to: parsed.data.assignedTo ?? null,
    lead_notes: parsed.data.notes ?? null,
  });
  if (error) {
    return { status: "error", message: error.code === "23505" ? "Такой источник или лид уже существует." : "Не удалось сохранить лид." };
  }
  const leadId = z.uuid().safeParse(data);
  if (!leadId.success) return { status: "error", message: "Не удалось открыть сохранённый лид." };

  revalidatePath("/crm/leads");
  redirect(`/crm/leads/${leadId.data}`);
}

export async function savePatientSource(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("crm.manage");
  const parsed = savePatientSourceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Проверьте параметры источника.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_patient_source", {
    org_id: context.organization.id,
    target_source_id: parsed.data.sourceId ?? null,
    source_code: parsed.data.code,
    source_name: parsed.data.name,
    source_color: parsed.data.color,
    source_sort_order: parsed.data.sortOrder,
  });
  if (error) {
    return { status: "error", message: error.code === "23505" ? "Источник с таким кодом или названием уже существует." : "Не удалось сохранить источник." };
  }
  revalidatePath("/crm/sources");
  revalidatePath("/crm/leads");
  return { status: "success", message: "Источник сохранён." };
}

export async function setPatientSourceActive(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("crm.manage");
  const parsed = setPatientSourceActiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Некорректный источник." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_patient_source_active", {
    org_id: context.organization.id,
    target_source_id: parsed.data.sourceId,
    target_is_active: parsed.data.isActive,
  });
  if (error) return { status: "error", message: "Не удалось изменить активность источника." };
  revalidatePath("/crm/sources");
  revalidatePath("/crm/leads");
  return { status: "success", message: "Активность источника изменена." };
}

export async function setLeadStatus(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("crm.manage");
  const parsed = setLeadStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Некорректный статус." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_lead_status", {
    org_id: context.organization.id,
    target_lead_id: parsed.data.leadId,
    target_status: parsed.data.status,
  });
  if (error) return { status: "error", message: "Не удалось изменить статус лида." };
  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${parsed.data.leadId}`);
  return { status: "success", message: "Статус обновлён." };
}

export async function addLeadActivity(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("crm.manage");
  const parsed = addLeadActivitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Проверьте запись активности.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_lead_activity", {
    org_id: context.organization.id,
    target_lead_id: parsed.data.leadId,
    activity_type: parsed.data.type,
    activity_body: parsed.data.body,
  });
  if (error) return { status: "error", message: "Не удалось добавить активность." };
  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${parsed.data.leadId}`);
  return { status: "success", message: "Активность добавлена." };
}
