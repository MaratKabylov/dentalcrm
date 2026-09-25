import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/organizations/repository";
import type { CompensationEntry, CompensationReferenceData, CompensationReportRow, CompensationRule } from "./types";

const referenceRowSchema = z.object({ entity_type: z.enum(["doctor", "service", "category"]), id: z.uuid(), parent_id: z.uuid().nullable(), code: z.string().nullable(), name: z.string(), is_active: z.boolean() });
const ruleRowSchema = z.object({ id: z.uuid(), employee_id: z.uuid().nullable(), employee_name: z.string().nullable(), service_id: z.uuid().nullable(), service_name: z.string().nullable(), category_id: z.uuid().nullable(), category_name: z.string().nullable(), rule_type: z.enum(["percent_revenue", "fixed_per_service", "percent_margin"]), value: z.coerce.number(), valid_from: z.string(), valid_to: z.string().nullable(), is_active: z.boolean() });
const reportRowSchema = z.object({ employee_id: z.uuid(), employee_name: z.string(), entries_count: z.coerce.number().int(), revenue_amount: z.coerce.number(), material_cost_amount: z.coerce.number(), compensation_amount: z.coerce.number() });
const entryRowSchema = z.object({ id: z.uuid(), employee_name: z.string(), service_name: z.string(), quantity: z.coerce.number(), rule_type: z.enum(["percent_revenue", "fixed_per_service", "percent_margin"]), rule_value: z.coerce.number(), revenue_amount: z.coerce.number(), material_cost_amount: z.coerce.number(), calculation_base: z.coerce.number(), compensation_amount: z.coerce.number(), performed_at: z.string(), posted_at: z.string() });

export async function getCompensationReferenceData(): Promise<CompensationReferenceData> {
  const context = await requirePermission("payroll.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_compensation_reference_data", { org_id: context.organization.id });
  if (error) throw new AppError("PAYROLL_REFERENCE_LOAD_FAILED", "Не удалось загрузить справочники начислений.");
  const parsed = z.array(referenceRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_PAYROLL_REFERENCE_DATA", "Получены некорректные справочники начислений.");
  const map = (type: "doctor" | "service" | "category") => parsed.data.filter((row) => row.entity_type === type).map((row) => ({ id: row.id, parentId: row.parent_id, code: row.code, name: row.name, isActive: row.is_active }));
  return { doctors: map("doctor"), services: map("service"), categories: map("category") };
}

export async function listCompensationRules(): Promise<CompensationRule[]> {
  const context = await requirePermission("payroll.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_compensation_rules", { org_id: context.organization.id });
  if (error) throw new AppError("PAYROLL_RULES_LOAD_FAILED", "Не удалось загрузить правила начислений.");
  const parsed = z.array(ruleRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_PAYROLL_RULE_DATA", "Получены некорректные правила начислений.");
  return parsed.data.map((row) => ({ id: row.id, employeeId: row.employee_id, employeeName: row.employee_name, serviceId: row.service_id, serviceName: row.service_name, categoryId: row.category_id, categoryName: row.category_name, ruleType: row.rule_type, value: row.value, validFrom: row.valid_from, validTo: row.valid_to, isActive: row.is_active }));
}

export async function getCompensationReport(from: string, to: string): Promise<CompensationReportRow[]> {
  const context = await requirePermission("payroll.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_compensation_report", { org_id: context.organization.id, report_start: from, report_end: to });
  if (error) throw new AppError("PAYROLL_REPORT_LOAD_FAILED", "Не удалось загрузить расчёт вознаграждений.");
  const parsed = z.array(reportRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_PAYROLL_REPORT_DATA", "Получен некорректный расчёт вознаграждений.");
  return parsed.data.map((row) => ({ employeeId: row.employee_id, employeeName: row.employee_name, entriesCount: row.entries_count, revenueAmount: row.revenue_amount, materialCostAmount: row.material_cost_amount, compensationAmount: row.compensation_amount }));
}

export async function listCompensationEntries(from: string, to: string): Promise<CompensationEntry[]> {
  const context = await requirePermission("payroll.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_compensation_entries", { org_id: context.organization.id, report_start: from, report_end: to });
  if (error) throw new AppError("PAYROLL_ENTRIES_LOAD_FAILED", "Не удалось загрузить расшифровку начислений.");
  const parsed = z.array(entryRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_PAYROLL_ENTRY_DATA", "Получена некорректная расшифровка начислений.");
  return parsed.data.map((row) => ({ id: row.id, employeeName: row.employee_name, serviceName: row.service_name, quantity: row.quantity, ruleType: row.rule_type, ruleValue: row.rule_value, revenueAmount: row.revenue_amount, materialCostAmount: row.material_cost_amount, calculationBase: row.calculation_base, compensationAmount: row.compensation_amount, performedAt: row.performed_at, postedAt: row.posted_at }));
}
