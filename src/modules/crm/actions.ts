"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import {
  addLeadActivitySchema,
  convertLeadSchema,
  saveMarketingCampaignSchema,
  saveLeadSchema,
  savePatientSourceSchema,
  setLeadStatusSchema,
  setMarketingCampaignActiveSchema,
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
  const { data, error } = await supabase.rpc("save_attributed_lead", {
    org_id: context.organization.id,
    target_lead_id: parsed.data.leadId ?? null,
    lead_branch_id: parsed.data.branchId ?? null,
    lead_full_name: parsed.data.fullName,
    lead_phone: parsed.data.phone,
    lead_email: parsed.data.email ?? null,
    lead_source_id: parsed.data.sourceId ?? null,
    lead_assigned_to: parsed.data.assignedTo ?? null,
    lead_notes: parsed.data.notes ?? null,
    lead_campaign_id: parsed.data.campaignId ?? null,
    lead_utm_source: parsed.data.utmSource ?? null,
    lead_utm_medium: parsed.data.utmMedium ?? null,
    lead_utm_campaign: parsed.data.utmCampaign ?? null,
    lead_utm_content: parsed.data.utmContent ?? null,
    lead_utm_term: parsed.data.utmTerm ?? null,
    lead_landing_page: parsed.data.landingPage ?? null,
  });
  if (error) {
    return { status: "error", message: error.code === "23505" ? "Такой источник или лид уже существует." : "Не удалось сохранить лид." };
  }
  const leadId = z.uuid().safeParse(data);
  if (!leadId.success) return { status: "error", message: "Не удалось открыть сохранённый лид." };

  revalidatePath("/crm/leads");
  redirect(`/crm/leads/${leadId.data}`);
}

export async function saveMarketingCampaign(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("crm.manage");
  const parsed = saveMarketingCampaignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте параметры кампании.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_marketing_campaign", {
    org_id: context.organization.id,
    target_campaign_id: parsed.data.campaignId ?? null,
    campaign_source_id: parsed.data.sourceId,
    campaign_branch_id: parsed.data.branchId ?? null,
    campaign_name: parsed.data.name,
    campaign_code: parsed.data.code,
    campaign_utm_source: parsed.data.utmSource ?? null,
    campaign_utm_medium: parsed.data.utmMedium ?? null,
    campaign_utm_campaign: parsed.data.utmCampaign ?? null,
    campaign_budget_amount: parsed.data.budgetAmount,
    campaign_starts_on: parsed.data.startsOn,
    campaign_ends_on: parsed.data.endsOn ?? null,
    campaign_is_active: parsed.data.isActive,
  });
  if (error) {
    return {
      status: "error",
      message: error.code === "23505"
        ? "Кампания с таким кодом уже существует."
        : "Не удалось сохранить кампанию. Проверьте источник и филиал.",
    };
  }
  revalidatePath("/crm/marketing");
  revalidatePath("/crm/leads/new");
  return { status: "success", message: "Кампания сохранена." };
}

export async function setMarketingCampaignActive(formData: FormData): Promise<void> {
  const context = await requirePermission("crm.manage");
  const parsed = setMarketingCampaignActiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_marketing_campaign_active", {
    org_id: context.organization.id,
    target_campaign_id: parsed.data.campaignId,
    target_is_active: parsed.data.isActive,
  });
  if (error) throw new Error("Не удалось изменить активность кампании.");
  revalidatePath("/crm/marketing");
  revalidatePath("/crm/leads/new");
}

export async function convertLeadToPatient(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("crm.manage");
  const parsed = convertLeadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Выберите пациента для привязки." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("convert_lead_to_patient", {
    org_id: context.organization.id,
    target_lead_id: parsed.data.leadId,
    target_patient_id: parsed.data.patientId,
  });
  if (error) {
    return {
      status: "error",
      message: error.code === "23505"
        ? "Этот пациент уже связан с другим лидом."
        : "Не удалось связать лид с пациентом.",
    };
  }
  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${parsed.data.leadId}`);
  revalidatePath("/crm/marketing");
  return { status: "success", message: "Лид отмечен как конвертированный." };
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
