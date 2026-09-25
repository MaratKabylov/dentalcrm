import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/organizations/repository";
import type { AnalyticsFilterOptions, AnalyticsFilters, DailyAnalyticsPoint, DoctorPerformance, ExecutiveAnalytics, InventoryAnalytics, ReceptionPerformance, SourceAnalytics } from "./types";

const executiveRowSchema = z.object({
  revenue_amount: z.coerce.number(), payments_amount: z.coerce.number(), debt_amount: z.coerce.number(), appointments_count: z.coerce.number().int(),
  completed_count: z.coerce.number().int(), cancelled_count: z.coerce.number().int(), no_show_count: z.coerce.number().int(), new_patients_count: z.coerce.number().int(),
  returning_patients_count: z.coerce.number().int(), average_bill: z.coerce.number(), treatment_plans_count: z.coerce.number().int(), accepted_plans_count: z.coerce.number().int(),
  unfinished_plans_count: z.coerce.number().int(), doctor_production: z.coerce.number(), material_cost: z.coerce.number(),
});
const dailyRowSchema = z.object({ metric_date: z.string(), revenue_amount: z.coerce.number(), payments_amount: z.coerce.number(), production_amount: z.coerce.number() });
const doctorRowSchema = z.object({ doctor_id: z.uuid(), doctor_name: z.string(), specialization_name: z.string(), appointments_count: z.coerce.number().int(), completed_count: z.coerce.number().int(), no_show_count: z.coerce.number().int(), available_minutes: z.coerce.number(), completed_minutes: z.coerce.number(), production_amount: z.coerce.number(), material_cost: z.coerce.number() });
const receptionRowSchema = z.object({ employee_id: z.uuid(), employee_name: z.string(), leads_count: z.coerce.number().int(), converted_leads_count: z.coerce.number().int(), appointments_created: z.coerce.number().int(), completed_appointments: z.coerce.number().int(), no_show_appointments: z.coerce.number().int() });
const sourceRowSchema = z.object({ source_id: z.uuid(), source_name: z.string(), source_color: z.string(), leads_count: z.coerce.number().int(), converted_count: z.coerce.number().int(), appointments_count: z.coerce.number().int(), completed_appointments_count: z.coerce.number().int(), revenue_amount: z.coerce.number(), payments_amount: z.coerce.number() });
const inventoryRowSchema = z.object({ item_id: z.uuid(), sku: z.string(), item_name: z.string(), unit: z.string(), consumed_quantity: z.coerce.number(), consumed_cost: z.coerce.number(), written_off_quantity: z.coerce.number(), current_quantity: z.coerce.number(), current_value: z.coerce.number(), days_of_stock: z.coerce.number().nullable() });
const filterRowSchema = z.object({ entity_type: z.enum(["branch", "doctor", "source", "specialization"]), id: z.uuid(), name: z.string(), color: z.string().nullable() });

async function analyticsRpc<T>(name: string, params: Record<string, unknown>, schema: z.ZodType<T>, code: string): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new AppError(`${code}_LOAD_FAILED`, "Не удалось загрузить данные аналитики.");
  const parsed = schema.safeParse(data ?? []);
  if (!parsed.success) throw new AppError(`INVALID_${code}_DATA`, "Получены некорректные данные аналитики.");
  return parsed.data;
}

function reportParams(orgId: string, filters: AnalyticsFilters) {
  return { org_id: orgId, report_start: filters.from, report_end: filters.to, branch_filter: filters.branchId ?? null };
}

export async function listAnalyticsFilters(): Promise<AnalyticsFilterOptions> {
  const context = await requirePermission("reports.read");
  const rows = await analyticsRpc("list_analytics_filters", { org_id: context.organization.id }, z.array(filterRowSchema), "ANALYTICS_FILTERS");
  return { branches: rows.filter((row) => row.entity_type === "branch"), doctors: rows.filter((row) => row.entity_type === "doctor"), sources: rows.filter((row) => row.entity_type === "source"), specializations: rows.filter((row) => row.entity_type === "specialization") };
}

export async function getExecutiveAnalytics(filters: AnalyticsFilters): Promise<ExecutiveAnalytics> {
  const context = await requirePermission("reports.read");
  const rows = await analyticsRpc("get_executive_analytics", { ...reportParams(context.organization.id, filters), doctor_filter: filters.doctorId ?? null }, z.array(executiveRowSchema), "EXECUTIVE_ANALYTICS");
  const row = rows[0];
  if (!row) throw new AppError("EMPTY_EXECUTIVE_ANALYTICS", "Аналитическая сводка не сформирована.");
  return { revenueAmount: row.revenue_amount, paymentsAmount: row.payments_amount, debtAmount: row.debt_amount, appointmentsCount: row.appointments_count, completedCount: row.completed_count, cancelledCount: row.cancelled_count, noShowCount: row.no_show_count, newPatientsCount: row.new_patients_count, returningPatientsCount: row.returning_patients_count, averageBill: row.average_bill, treatmentPlansCount: row.treatment_plans_count, acceptedPlansCount: row.accepted_plans_count, unfinishedPlansCount: row.unfinished_plans_count, doctorProduction: row.doctor_production, materialCost: row.material_cost };
}

export async function getDailyAnalyticsSeries(filters: AnalyticsFilters): Promise<DailyAnalyticsPoint[]> {
  const context = await requirePermission("reports.read");
  const rows = await analyticsRpc("get_daily_analytics_series", { ...reportParams(context.organization.id, filters), doctor_filter: filters.doctorId ?? null }, z.array(dailyRowSchema), "DAILY_ANALYTICS");
  return rows.map((row) => ({ date: row.metric_date, revenueAmount: row.revenue_amount, paymentsAmount: row.payments_amount, productionAmount: row.production_amount }));
}

export async function getDoctorPerformance(filters: AnalyticsFilters): Promise<DoctorPerformance[]> {
  const context = await requirePermission("reports.read");
  const rows = await analyticsRpc("get_doctor_performance", { ...reportParams(context.organization.id, filters), specialization_filter: filters.specializationId ?? null }, z.array(doctorRowSchema), "DOCTOR_PERFORMANCE");
  return rows.map((row) => ({ doctorId: row.doctor_id, doctorName: row.doctor_name, specializationName: row.specialization_name, appointmentsCount: row.appointments_count, completedCount: row.completed_count, noShowCount: row.no_show_count, availableMinutes: row.available_minutes, completedMinutes: row.completed_minutes, productionAmount: row.production_amount, materialCost: row.material_cost }));
}

export async function getReceptionPerformance(filters: AnalyticsFilters): Promise<ReceptionPerformance[]> {
  const context = await requirePermission("reports.read");
  const rows = await analyticsRpc("get_reception_performance", reportParams(context.organization.id, filters), z.array(receptionRowSchema), "RECEPTION_PERFORMANCE");
  return rows.map((row) => ({ employeeId: row.employee_id, employeeName: row.employee_name, leadsCount: row.leads_count, convertedLeadsCount: row.converted_leads_count, appointmentsCreated: row.appointments_created, completedAppointments: row.completed_appointments, noShowAppointments: row.no_show_appointments }));
}

export async function getSourceAnalytics(filters: AnalyticsFilters): Promise<SourceAnalytics[]> {
  const context = await requirePermission("reports.read");
  const rows = await analyticsRpc("get_source_analytics", { ...reportParams(context.organization.id, filters), source_filter: filters.sourceId ?? null }, z.array(sourceRowSchema), "SOURCE_ANALYTICS");
  return rows.map((row) => ({ sourceId: row.source_id, sourceName: row.source_name, sourceColor: row.source_color, leadsCount: row.leads_count, convertedCount: row.converted_count, appointmentsCount: row.appointments_count, completedAppointmentsCount: row.completed_appointments_count, revenueAmount: row.revenue_amount, paymentsAmount: row.payments_amount }));
}

export async function getInventoryAnalytics(filters: AnalyticsFilters): Promise<InventoryAnalytics[]> {
  const context = await requirePermission("reports.read");
  const rows = await analyticsRpc("get_inventory_analytics", reportParams(context.organization.id, filters), z.array(inventoryRowSchema), "INVENTORY_ANALYTICS");
  return rows.map((row) => ({ itemId: row.item_id, sku: row.sku, itemName: row.item_name, unit: row.unit, consumedQuantity: row.consumed_quantity, consumedCost: row.consumed_cost, writtenOffQuantity: row.written_off_quantity, currentQuantity: row.current_quantity, currentValue: row.current_value, daysOfStock: row.days_of_stock }));
}
