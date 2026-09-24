import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/organizations/repository";
import { recallStatusSchema, recallTypeSchema } from "@/modules/recalls/schemas";
import type {
  RecallDoctorOption,
  RecallFilters,
  RecallListItem,
  RecallPatientOption,
  RecallSummary,
} from "@/modules/recalls/types";

const recallRowSchema = z.object({
  id: z.uuid(),
  patient_id: z.uuid(),
  patient_name: z.string(),
  patient_number: z.string(),
  patient_phone: z.string(),
  doctor_id: z.uuid().nullable(),
  doctor_name: z.string().nullable(),
  recall_type: recallTypeSchema,
  due_date: z.string(),
  status: recallStatusSchema,
  notes: z.string().nullable(),
  task_id: z.uuid().nullable(),
  is_overdue: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

const summaryRowSchema = z.object({
  active_count: z.coerce.number().int().nonnegative(),
  overdue_count: z.coerce.number().int().nonnegative(),
  due_today_count: z.coerce.number().int().nonnegative(),
  task_pending_count: z.coerce.number().int().nonnegative(),
});

const patientOptionRowSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  secondary: z.string(),
});

const doctorOptionRowSchema = z.object({
  id: z.uuid(),
  full_name: z.string(),
  specialization_name: z.string(),
});

function toRecall(row: z.infer<typeof recallRowSchema>): RecallListItem {
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    patientNumber: row.patient_number,
    patientPhone: row.patient_phone,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    type: row.recall_type,
    dueDate: row.due_date,
    status: row.status,
    notes: row.notes,
    taskId: row.task_id,
    isOverdue: row.is_overdue,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listRecalls(filters: RecallFilters = {}): Promise<RecallListItem[]> {
  const context = await requirePermission("recalls.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_recalls", {
    org_id: context.organization.id,
    search_query: filters.q || null,
    status_filter: filters.status && filters.status !== "all" ? filters.status : null,
    type_filter: filters.type && filters.type !== "all" ? filters.type : null,
    doctor_filter: filters.doctor ?? null,
    due_filter: filters.due && filters.due !== "all" ? filters.due : null,
    result_limit: 300,
  });
  if (error) throw new AppError("RECALLS_LOAD_FAILED", "Не удалось загрузить повторные визиты.");
  const parsed = z.array(recallRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_RECALL_DATA", "Получены некорректные данные повторных визитов.");
  return parsed.data.map(toRecall);
}

export async function getRecallSummary(): Promise<RecallSummary> {
  const context = await requirePermission("recalls.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_recall_summary", { org_id: context.organization.id });
  if (error) throw new AppError("RECALL_SUMMARY_LOAD_FAILED", "Не удалось загрузить сводку повторных визитов.");
  const parsed = z.array(summaryRowSchema).safeParse(data ?? []);
  if (!parsed.success || !parsed.data[0]) {
    throw new AppError("INVALID_RECALL_SUMMARY_DATA", "Получена некорректная сводка повторных визитов.");
  }
  return {
    active: parsed.data[0].active_count,
    overdue: parsed.data[0].overdue_count,
    dueToday: parsed.data[0].due_today_count,
    tasksPending: parsed.data[0].task_pending_count,
  };
}

export async function listRecallPatients(): Promise<RecallPatientOption[]> {
  const context = await requirePermission("recalls.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_recall_patients", { org_id: context.organization.id });
  if (error) throw new AppError("RECALL_PATIENTS_LOAD_FAILED", "Не удалось загрузить пациентов.");
  const parsed = z.array(patientOptionRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_RECALL_PATIENT_DATA", "Получены некорректные данные пациентов.");
  return parsed.data;
}

export async function listRecallDoctors(): Promise<RecallDoctorOption[]> {
  const context = await requirePermission("recalls.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_recall_doctors", { org_id: context.organization.id });
  if (error) throw new AppError("RECALL_DOCTORS_LOAD_FAILED", "Не удалось загрузить врачей.");
  const parsed = z.array(doctorOptionRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_RECALL_DOCTOR_DATA", "Получены некорректные данные врачей.");
  return parsed.data.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    specializationName: row.specialization_name,
  }));
}
