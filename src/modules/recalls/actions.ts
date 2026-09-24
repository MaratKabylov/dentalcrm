"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import { requirePermission } from "@/modules/organizations/repository";
import { saveRecallSchema, setRecallStatusSchema } from "@/modules/recalls/schemas";

export async function saveRecall(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("recalls.manage");
  const parsed = saveRecallSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте параметры повторного визита.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_recall", {
    org_id: context.organization.id,
    target_recall_id: parsed.data.recallId ?? null,
    recall_patient_id: parsed.data.patientId,
    recall_doctor_id: parsed.data.doctorId ?? null,
    target_recall_type: parsed.data.recallType,
    target_due_date: parsed.data.dueDate,
    recall_notes: parsed.data.notes ?? null,
  });
  if (error) return { status: "error", message: "Не удалось сохранить повторный визит." };

  revalidatePath("/crm/recalls");
  redirect("/crm/recalls?created=1");
}

export async function setRecallStatus(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("recalls.manage");
  const parsed = setRecallStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Некорректный статус повторного визита." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_recall_status", {
    org_id: context.organization.id,
    target_recall_id: parsed.data.recallId,
    target_status: parsed.data.status,
  });
  if (error) return { status: "error", message: "Не удалось изменить статус повторного визита." };

  revalidatePath("/crm/recalls");
  return { status: "success", message: "Статус обновлён." };
}

export async function generateDueRecallTasks(
  _state: FormActionState,
  _formData: FormData,
): Promise<FormActionState> {
  void _state;
  void _formData;
  const context = await requirePermission("recalls.manage");
  if (!context.can("tasks.manage")) {
    return { status: "error", message: "Недостаточно прав для создания задач." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_due_recall_tasks", {
    org_id: context.organization.id,
  });
  if (error) return { status: "error", message: "Не удалось сформировать задачи по повторным визитам." };
  const parsed = z.coerce.number().int().nonnegative().safeParse(data);
  if (!parsed.success) return { status: "error", message: "Получен некорректный результат генерации." };

  revalidatePath("/crm/recalls");
  revalidatePath("/crm/tasks");
  return {
    status: "success",
    message: parsed.data === 0
      ? "Новых задач для формирования нет."
      : `Сформировано задач: ${parsed.data}.`,
  };
}
