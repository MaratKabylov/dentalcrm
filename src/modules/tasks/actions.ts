"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import { requirePermission } from "@/modules/organizations/repository";
import { saveTaskSchema, setTaskStatusSchema } from "@/modules/tasks/schemas";

export async function saveTask(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("tasks.manage");
  const parsed = saveTaskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте параметры задачи.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_task", {
    org_id: context.organization.id,
    target_task_id: parsed.data.taskId ?? null,
    task_branch_id: parsed.data.branchId ?? null,
    task_title: parsed.data.title,
    task_description: parsed.data.description ?? null,
    task_priority: parsed.data.priority,
    task_assigned_to: parsed.data.assignedTo ?? null,
    task_due_date: parsed.data.dueDate ?? null,
    task_due_time: parsed.data.dueTime ?? null,
    task_related_entity_type: parsed.data.relatedEntityType ?? null,
    task_related_entity_id: parsed.data.relatedEntityId ?? null,
  });
  if (error) return { status: "error", message: "Не удалось сохранить задачу." };

  revalidatePath("/crm/tasks");
  redirect("/crm/tasks?created=1");
}

export async function setTaskStatus(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("tasks.manage");
  const parsed = setTaskStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Некорректный статус задачи." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_task_status", {
    org_id: context.organization.id,
    target_task_id: parsed.data.taskId,
    target_status: parsed.data.status,
  });
  if (error) return { status: "error", message: "Не удалось изменить статус задачи." };

  revalidatePath("/crm/tasks");
  return { status: "success", message: "Статус обновлён." };
}
