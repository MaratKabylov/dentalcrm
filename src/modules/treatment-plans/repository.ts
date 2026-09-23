import { cache } from "react";
import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/organizations/repository";
import type {
  TreatmentPlan,
  TreatmentPlanListItem,
} from "@/modules/treatment-plans/types";

const statusSchema = z.enum(["draft", "proposed", "approved", "rejected", "in_progress", "completed", "cancelled"]);

const planRowSchema = z.object({
  id: z.uuid(),
  patient_id: z.uuid(),
  patient_name: z.string(),
  patient_external_number: z.string(),
  doctor_id: z.uuid(),
  doctor_name: z.string(),
  status: statusSchema,
  title: z.string(),
  current_version_no: z.number().int().positive(),
  total_amount: z.coerce.number(),
  discount_amount: z.coerce.number(),
  final_amount: z.coerce.number(),
  created_at: z.string(),
  updated_at: z.string(),
  accepted_at: z.string().nullable(),
  completed_at: z.string().nullable(),
});

const itemRowSchema = z.object({
  id: z.uuid(),
  service_id: z.uuid(),
  service_code: z.string(),
  service_name: z.string(),
  tooth_code: z.string().nullable(),
  quantity: z.coerce.number(),
  unit_price: z.coerce.number(),
  discount_amount: z.coerce.number(),
  amount: z.coerce.number(),
  priority: z.number().int(),
  planned_order: z.number().int(),
  status: z.enum(["planned", "approved", "in_progress", "completed", "cancelled"]),
  notes: z.string().nullable(),
});

const versionRowSchema = z.object({
  id: z.uuid(),
  version_no: z.number().int().positive(),
  title: z.string(),
  total_amount: z.coerce.number(),
  discount_amount: z.coerce.number(),
  final_amount: z.coerce.number(),
  created_at: z.string(),
});

const listRowSchema = z.object({
  id: z.uuid(),
  doctor_name: z.string(),
  status: statusSchema,
  title: z.string(),
  current_version_no: z.number().int().positive(),
  total_amount: z.coerce.number(),
  discount_amount: z.coerce.number(),
  final_amount: z.coerce.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const getTreatmentPlan = cache(async (planId: string): Promise<TreatmentPlan | null> => {
  const context = await requirePermission("clinical.read");
  const supabase = await createClient();
  const [planResult, itemsResult, versionsResult] = await Promise.all([
    supabase.rpc("get_treatment_plan", { org_id: context.organization.id, target_plan_id: planId }),
    supabase.rpc("list_treatment_plan_items", { org_id: context.organization.id, target_plan_id: planId }),
    supabase.rpc("list_treatment_plan_versions", { org_id: context.organization.id, target_plan_id: planId }),
  ]);
  if (planResult.error || itemsResult.error || versionsResult.error) {
    throw new AppError("TREATMENT_PLAN_LOAD_FAILED", "Не удалось загрузить план лечения.");
  }

  const plans = z.array(planRowSchema).safeParse(planResult.data ?? []);
  const items = z.array(itemRowSchema).safeParse(itemsResult.data ?? []);
  const versions = z.array(versionRowSchema).safeParse(versionsResult.data ?? []);
  if (!plans.success || !items.success || !versions.success) {
    throw new AppError("INVALID_TREATMENT_PLAN_DATA", "Получены некорректные данные плана лечения.");
  }
  const plan = plans.data[0];
  if (!plan) return null;

  return {
    id: plan.id,
    patientId: plan.patient_id,
    patientName: plan.patient_name,
    patientExternalNumber: plan.patient_external_number,
    doctorId: plan.doctor_id,
    doctorName: plan.doctor_name,
    status: plan.status,
    title: plan.title,
    currentVersionNo: plan.current_version_no,
    totalAmount: plan.total_amount,
    discountAmount: plan.discount_amount,
    finalAmount: plan.final_amount,
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
    acceptedAt: plan.accepted_at,
    completedAt: plan.completed_at,
    items: items.data.map((item) => ({
      id: item.id,
      serviceId: item.service_id,
      serviceCode: item.service_code,
      serviceName: item.service_name,
      toothCode: item.tooth_code,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      discountAmount: item.discount_amount,
      amount: item.amount,
      priority: item.priority,
      plannedOrder: item.planned_order,
      status: item.status,
      notes: item.notes,
    })),
    versions: versions.data.map((version) => ({
      id: version.id,
      versionNo: version.version_no,
      title: version.title,
      totalAmount: version.total_amount,
      discountAmount: version.discount_amount,
      finalAmount: version.final_amount,
      createdAt: version.created_at,
    })),
  };
});

export async function listPatientTreatmentPlans(patientId: string): Promise<TreatmentPlanListItem[]> {
  const context = await requirePermission("clinical.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_patient_treatment_plans", {
    org_id: context.organization.id,
    target_patient_id: patientId,
  });
  if (error) throw new AppError("TREATMENT_PLANS_LOAD_FAILED", "Не удалось загрузить планы лечения.");
  const parsed = z.array(listRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_TREATMENT_PLANS_DATA", "Получены некорректные данные планов лечения.");
  return parsed.data.map((plan) => ({
    id: plan.id,
    doctorName: plan.doctor_name,
    status: plan.status,
    title: plan.title,
    currentVersionNo: plan.current_version_no,
    totalAmount: plan.total_amount,
    discountAmount: plan.discount_amount,
    finalAmount: plan.final_amount,
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
  }));
}
