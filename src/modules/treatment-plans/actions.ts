"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import { requirePermission } from "@/modules/organizations/repository";
import {
  changeTreatmentPlanStatusSchema,
  saveTreatmentPlanFormSchema,
  treatmentPlanItemsSchema,
} from "@/modules/treatment-plans/schemas";

export async function saveTreatmentPlan(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("treatment_plan.manage");
  const parsedForm = saveTreatmentPlanFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsedForm.success) {
    return { status: "error", message: "Проверьте параметры плана лечения.", fieldErrors: parsedForm.error.flatten().fieldErrors };
  }

  let rawItems: unknown;
  try {
    rawItems = JSON.parse(parsedForm.data.items);
  } catch {
    return { status: "error", message: "Позиции плана содержат некорректные данные." };
  }
  const parsedItems = treatmentPlanItemsSchema.safeParse(rawItems);
  if (!parsedItems.success) {
    return { status: "error", message: "Проверьте услуги, количество, цены и скидки." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_treatment_plan", {
    org_id: context.organization.id,
    target_plan_id: parsedForm.data.planId ?? null,
    target_patient_id: parsedForm.data.patientId,
    target_doctor_id: parsedForm.data.doctorId,
    plan_title: parsedForm.data.title,
    items_payload: parsedItems.data,
  });
  if (error) return { status: "error", message: "Не удалось сохранить план лечения." };

  const planId = z.uuid().parse(data);
  revalidatePath(`/patients/${parsedForm.data.patientId}/treatment`);
  revalidatePath(`/clinical/treatment-plans/${planId}`);
  redirect(`/clinical/treatment-plans/${planId}?saved=1`);
}

export async function changeTreatmentPlanStatus(formData: FormData) {
  const context = await requirePermission("treatment_plan.manage");
  const parsed = changeTreatmentPlanStatusSchema.parse({
    planId: formData.get("planId"),
    patientId: formData.get("patientId"),
    status: formData.get("status"),
  });
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_treatment_plan_status", {
    org_id: context.organization.id,
    target_plan_id: parsed.planId,
    target_status: parsed.status,
  });
  if (error) throw new Error("Не удалось изменить статус плана лечения.");
  revalidatePath(`/clinical/treatment-plans/${parsed.planId}`);
  revalidatePath(`/patients/${parsed.patientId}/treatment`);
}
