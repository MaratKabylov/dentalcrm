"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSafeErrorMessage } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import {
  branchWorkingHoursSchema,
  saveBranchSchema,
  saveRoomSchema,
  setBranchActiveSchema,
  setMemberBranchAccessSchema,
  setMemberBranchScopeSchema,
} from "@/modules/branches/schemas";
import {
  requireBranchPermission,
  requirePermission,
} from "@/modules/organizations/repository";

function errorState(error: unknown): FormActionState {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    if (error.message.includes("at least one active branch")) {
      return { status: "error", message: "В организации должен остаться хотя бы один активный филиал." };
    }
    if (error.message.includes("Switch member from all branches")) {
      return { status: "error", message: "Сначала отключите пользователю режим доступа ко всем филиалам." };
    }
  }
  return { status: "error", message: getSafeErrorMessage(error) };
}

export async function saveBranch(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("branches.manage");
  const parsed = saveBranchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте данные филиала.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  if (parsed.data.branchId) {
    await requireBranchPermission("branches.manage", parsed.data.branchId);
  }

  let savedBranchId: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_branch", {
      org_id: context.organization.id,
      target_branch_id: parsed.data.branchId ?? null,
      branch_name: parsed.data.name,
      branch_address: parsed.data.address,
      branch_phone: parsed.data.phone,
      branch_email: parsed.data.email,
      branch_timezone: parsed.data.timezone,
    });
    if (error) throw error;
    savedBranchId = String(data);
  } catch (error) {
    return errorState(error);
  }

  revalidatePath("/settings/branches");
  revalidatePath("/dashboard", "layout");
  redirect(`/settings/branches/${savedBranchId}?saved=1`);
}

export async function setBranchActive(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = setBranchActiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Филиал не найден." };
  const context = await requireBranchPermission("branches.manage", parsed.data.branchId);

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_branch_active", {
      org_id: context.organization.id,
      target_branch_id: parsed.data.branchId,
      target_is_active: parsed.data.isActive,
    });
    if (error) throw error;
    revalidatePath("/settings/branches");
    revalidatePath(`/settings/branches/${parsed.data.branchId}`);
    revalidatePath("/dashboard", "layout");
    return {
      status: "success",
      message: parsed.data.isActive ? "Филиал восстановлен." : "Филиал отправлен в архив.",
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function saveBranchWorkingHours(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const branchId = String(formData.get("branchId") ?? "");
  const context = await requireBranchPermission("branches.manage", branchId);
  const schedule = Array.from({ length: 7 }, (_, index) => {
    const weekday = index + 1;
    const isWorking = formData.get(`working-${weekday}`) === "on";
    return {
      weekday,
      isWorking,
      startTime: isWorking ? String(formData.get(`start-${weekday}`) ?? "") : null,
      endTime: isWorking ? String(formData.get(`end-${weekday}`) ?? "") : null,
    };
  });
  const parsed = branchWorkingHoursSchema.safeParse(schedule);
  if (!parsed.success) {
    return { status: "error", message: "Проверьте рабочие дни и время работы." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_branch_working_hours", {
      org_id: context.organization.id,
      target_branch_id: branchId,
      schedule: parsed.data,
    });
    if (error) throw error;
    revalidatePath(`/settings/branches/${branchId}`);
    return { status: "success", message: "График филиала сохранён." };
  } catch (error) {
    return errorState(error);
  }
}

export async function saveBranchRoom(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = saveRoomSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте название кабинета.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const context = await requireBranchPermission("directories.manage_branch", parsed.data.branchId);

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("save_branch_room", {
      org_id: context.organization.id,
      target_branch_id: parsed.data.branchId,
      target_room_id: parsed.data.roomId ?? null,
      room_name: parsed.data.name,
      room_is_active: parsed.data.isActive,
    });
    if (error) throw error;
    revalidatePath(`/settings/branches/${parsed.data.branchId}`);
    return { status: "success", message: "Кабинет сохранён." };
  } catch (error) {
    return errorState(error);
  }
}

export async function updateMemberBranchAccess(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = setMemberBranchAccessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Пользователь или филиал не найден." };
  const context = await requireBranchPermission("branch_access.manage", parsed.data.branchId);

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_member_single_branch_access", {
      org_id: context.organization.id,
      target_membership_id: parsed.data.membershipId,
      target_branch_id: parsed.data.branchId,
      grant_access: parsed.data.grantAccess,
    });
    if (error) throw error;
    revalidatePath(`/settings/branches/${parsed.data.branchId}`);
    revalidatePath("/settings/users");
    revalidatePath("/dashboard", "layout");
    return {
      status: "success",
      message: parsed.data.grantAccess ? "Доступ выдан." : "Доступ отозван.",
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function updateMemberBranchScope(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = setMemberBranchScopeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Пользователь или филиал не найден." };
  const context = await requireBranchPermission("branch_access.manage", parsed.data.branchId);

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_member_branch_access", {
      org_id: context.organization.id,
      target_membership_id: parsed.data.membershipId,
      allow_all_branches: parsed.data.allowAllBranches,
      target_primary_branch_id: parsed.data.branchId,
      allowed_branch_ids: parsed.data.allowAllBranches ? [] : [parsed.data.branchId],
    });
    if (error) throw error;
    revalidatePath("/settings/branches");
    revalidatePath(`/settings/branches/${parsed.data.branchId}`);
    revalidatePath("/settings/users");
    revalidatePath("/dashboard", "layout");
    return {
      status: "success",
      message: parsed.data.allowAllBranches
        ? "Открыт доступ ко всем филиалам."
        : "Доступ ограничен этим филиалом.",
    };
  } catch (error) {
    return errorState(error);
  }
}
