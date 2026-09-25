import { cache } from "react";
import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { leadStatusSchema } from "@/modules/crm/schemas";
import type {
  CrmAssignee,
  CrmOption,
  LeadAttribution,
  LeadActivity,
  LeadFilters,
  LeadListItem,
  MarketingAttributionRow,
  MarketingCampaign,
  MarketingReportFilters,
  PatientSource,
} from "@/modules/crm/types";
import { requirePermission } from "@/modules/organizations/repository";

const patientSourceRowSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  color: z.string(),
  sort_order: z.number().int(),
  is_active: z.boolean(),
});

const optionRowSchema = z.object({ id: z.uuid(), name: z.string() });
const assigneeRowSchema = z.object({ id: z.uuid(), full_name: z.string() });

const marketingCampaignRowSchema = z.object({
  id: z.uuid(),
  source_id: z.uuid(),
  source_name: z.string(),
  source_color: z.string(),
  branch_id: z.uuid().nullable(),
  branch_name: z.string().nullable(),
  name: z.string(),
  code: z.string(),
  utm_source: z.string().nullable(),
  utm_medium: z.string().nullable(),
  utm_campaign: z.string().nullable(),
  budget_amount: z.coerce.number(),
  starts_on: z.string(),
  ends_on: z.string().nullable(),
  is_active: z.boolean(),
});

const leadAttributionRowSchema = z.object({
  campaign_id: z.uuid().nullable(),
  campaign_name: z.string().nullable(),
  utm_source: z.string().nullable(),
  utm_medium: z.string().nullable(),
  utm_campaign: z.string().nullable(),
  utm_content: z.string().nullable(),
  utm_term: z.string().nullable(),
  landing_page: z.string().nullable(),
});

const marketingAttributionRowSchema = z.object({
  campaign_id: z.uuid().nullable(),
  campaign_name: z.string(),
  source_id: z.uuid(),
  source_name: z.string(),
  source_color: z.string(),
  branch_id: z.uuid().nullable(),
  branch_name: z.string().nullable(),
  budget_amount: z.coerce.number(),
  leads_count: z.coerce.number().int().nonnegative(),
  converted_count: z.coerce.number().int().nonnegative(),
  appointments_count: z.coerce.number().int().nonnegative(),
  completed_appointments_count: z.coerce.number().int().nonnegative(),
  revenue_amount: z.coerce.number(),
});

const leadRowSchema = z.object({
  id: z.uuid(),
  branch_id: z.uuid().nullable(),
  branch_name: z.string().nullable(),
  full_name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  source_id: z.uuid(),
  source_name: z.string(),
  source_color: z.string(),
  status: leadStatusSchema,
  assigned_to: z.uuid().nullable(),
  assignee_name: z.string().nullable(),
  notes: z.string().nullable(),
  converted_patient_id: z.uuid().nullable(),
  activity_count: z.coerce.number().int().nonnegative(),
  last_activity_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const activityRowSchema = z.object({
  id: z.uuid(),
  type: z.enum(["note", "call", "email", "message", "status_change"]),
  body: z.string(),
  employee_name: z.string(),
  created_at: z.string(),
});

function toLead(row: z.infer<typeof leadRowSchema>): LeadListItem {
  return {
    id: row.id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceColor: row.source_color,
    status: row.status,
    assignedTo: row.assigned_to,
    assigneeName: row.assignee_name,
    notes: row.notes,
    convertedPatientId: row.converted_patient_id,
    activityCount: row.activity_count,
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPatientSources(includeInactive = false): Promise<PatientSource[]> {
  const context = await requirePermission("crm.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_patient_sources", {
    org_id: context.organization.id,
    include_inactive: includeInactive,
  });
  if (error) throw new AppError("CRM_SOURCES_LOAD_FAILED", "Не удалось загрузить источники.");
  const parsed = z.array(patientSourceRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_CRM_SOURCE_DATA", "Получены некорректные данные источников.");
  return parsed.data.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }));
}

export async function listMarketingCampaigns(includeInactive = false): Promise<MarketingCampaign[]> {
  const context = await requirePermission("crm.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_marketing_campaigns", {
    org_id: context.organization.id,
    include_inactive: includeInactive,
  });
  if (error) throw new AppError("CRM_CAMPAIGNS_LOAD_FAILED", "Не удалось загрузить маркетинговые кампании.");
  const parsed = z.array(marketingCampaignRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_CRM_CAMPAIGN_DATA", "Получены некорректные данные кампаний.");
  return parsed.data.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceColor: row.source_color,
    branchId: row.branch_id,
    branchName: row.branch_name,
    name: row.name,
    code: row.code,
    utmSource: row.utm_source,
    utmMedium: row.utm_medium,
    utmCampaign: row.utm_campaign,
    budgetAmount: row.budget_amount,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    isActive: row.is_active,
  }));
}

export async function getLeadAttribution(leadId: string): Promise<LeadAttribution | null> {
  const context = await requirePermission("crm.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_lead_attribution", {
    org_id: context.organization.id,
    target_lead_id: leadId,
  });
  if (error) throw new AppError("LEAD_ATTRIBUTION_LOAD_FAILED", "Не удалось загрузить атрибуцию лида.");
  const parsed = z.array(leadAttributionRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_LEAD_ATTRIBUTION_DATA", "Получены некорректные данные атрибуции.");
  const row = parsed.data[0];
  return row ? {
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    utmSource: row.utm_source,
    utmMedium: row.utm_medium,
    utmCampaign: row.utm_campaign,
    utmContent: row.utm_content,
    utmTerm: row.utm_term,
    landingPage: row.landing_page,
  } : null;
}

export async function listMarketingAttribution(
  filters: MarketingReportFilters,
): Promise<MarketingAttributionRow[]> {
  const context = await requirePermission("reports.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_marketing_attribution", {
    org_id: context.organization.id,
    report_start: filters.from,
    report_end: filters.to,
    source_filter: filters.source ?? null,
    branch_filter: filters.branch ?? null,
  });
  if (error) throw new AppError("MARKETING_REPORT_LOAD_FAILED", "Не удалось сформировать отчёт по маркетингу.");
  const parsed = z.array(marketingAttributionRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_MARKETING_REPORT_DATA", "Получены некорректные данные отчёта.");
  return parsed.data.map((row) => ({
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceColor: row.source_color,
    branchId: row.branch_id,
    branchName: row.branch_name,
    budgetAmount: row.budget_amount,
    leadsCount: row.leads_count,
    convertedCount: row.converted_count,
    appointmentsCount: row.appointments_count,
    completedAppointmentsCount: row.completed_appointments_count,
    revenueAmount: row.revenue_amount,
  }));
}

export async function listCrmBranches(): Promise<CrmOption[]> {
  const context = await requirePermission("crm.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_crm_branches", { org_id: context.organization.id });
  if (error) throw new AppError("CRM_BRANCHES_LOAD_FAILED", "Не удалось загрузить филиалы.");
  const parsed = z.array(optionRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_CRM_BRANCH_DATA", "Получены некорректные данные филиалов.");
  return parsed.data;
}

export async function listCrmAssignees(): Promise<CrmAssignee[]> {
  const context = await requirePermission("crm.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_crm_assignees", { org_id: context.organization.id });
  if (error) throw new AppError("CRM_ASSIGNEES_LOAD_FAILED", "Не удалось загрузить ответственных.");
  const parsed = z.array(assigneeRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_CRM_ASSIGNEE_DATA", "Получены некорректные данные ответственных.");
  return parsed.data.map((row) => ({ id: row.id, fullName: row.full_name }));
}

export async function listLeads(filters: LeadFilters = {}): Promise<LeadListItem[]> {
  const context = await requirePermission("crm.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_crm_leads", {
    org_id: context.organization.id,
    search_query: filters.q || null,
    status_filter: !filters.status || filters.status === "all" ? null : filters.status,
    source_filter: filters.source ?? null,
    branch_filter: filters.branch ?? null,
    lead_filter: null,
    result_limit: 200,
  });
  if (error) throw new AppError("CRM_LEADS_LOAD_FAILED", "Не удалось загрузить лиды.");
  const parsed = z.array(leadRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_CRM_LEAD_DATA", "Получены некорректные данные лидов.");
  return parsed.data.map(toLead);
}

export const getLead = cache(async (leadId: string): Promise<LeadListItem | null> => {
  const context = await requirePermission("crm.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_crm_lead", {
    org_id: context.organization.id,
    target_lead_id: leadId,
  });
  if (error) throw new AppError("CRM_LEAD_LOAD_FAILED", "Не удалось загрузить карточку лида.");
  const parsed = z.array(leadRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_CRM_LEAD_DATA", "Получены некорректные данные лида.");
  return parsed.data[0] ? toLead(parsed.data[0]) : null;
});

export async function listLeadActivities(leadId: string): Promise<LeadActivity[]> {
  const context = await requirePermission("crm.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_lead_activities", {
    org_id: context.organization.id,
    target_lead_id: leadId,
  });
  if (error) throw new AppError("CRM_ACTIVITIES_LOAD_FAILED", "Не удалось загрузить историю лида.");
  const parsed = z.array(activityRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_CRM_ACTIVITY_DATA", "Получены некорректные данные истории лида.");
  return parsed.data.map((row) => ({
    id: row.id,
    type: row.type,
    body: row.body,
    employeeName: row.employee_name,
    createdAt: row.created_at,
  }));
}
