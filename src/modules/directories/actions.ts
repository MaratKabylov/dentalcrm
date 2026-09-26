"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import { requireBranchPermission, requirePermission } from "@/modules/organizations/repository";
import { saveDirectoryEntrySchema, setDirectoryEntryActiveSchema } from "./schemas";

export async function saveDirectoryEntry(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = saveDirectoryEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Проверьте значение справочника.", fieldErrors: parsed.error.flatten().fieldErrors };
  const context = parsed.data.scope === "organization"
    ? await requirePermission("directories.manage_global")
    : await requireBranchPermission("directories.manage_branch", parsed.data.branchId!);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_directory_entry", {
    org_id: context.organization.id, target_entry_id: parsed.data.entryId ?? null,
    entry_kind: parsed.data.kind, entry_code: parsed.data.code, entry_name: parsed.data.name,
    entry_color: parsed.data.color, entry_scope: parsed.data.scope,
    entry_branch_id: parsed.data.branchId ?? null, entry_sort_order: parsed.data.sortOrder,
  });
  if (error) return { status: "error", message: error.code === "23505" ? "Такое значение уже существует." : "Не удалось сохранить значение." };
  revalidatePath("/settings/directories");
  return { status: "success", message: "Значение сохранено." };
}

export async function setDirectoryEntryActive(_state: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = setDirectoryEntryActiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Значение не найдено." };
  const context = parsed.data.scope === "organization"
    ? await requirePermission("directories.manage_global")
    : await requireBranchPermission("directories.manage_branch", parsed.data.branchId!);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_directory_entry_active", {
    org_id: context.organization.id, target_entry_id: parsed.data.entryId,
    entry_kind: parsed.data.kind, target_is_active: parsed.data.isActive,
  });
  if (error) return { status: "error", message: error.message.includes("System") ? "Системное значение нельзя архивировать." : "Не удалось изменить статус." };
  revalidatePath("/settings/directories");
  return { status: "success", message: parsed.data.isActive ? "Значение восстановлено." : "Значение архивировано." };
}
