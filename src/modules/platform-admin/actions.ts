"use server";

import { revalidatePath } from "next/cache";

import { getSafeErrorMessage } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import { requireSuperAdmin } from "@/modules/platform-admin/repository";
import { updateOrganizationAccessSchema } from "@/modules/platform-admin/schemas";

export async function updateOrganizationAccess(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  await requireSuperAdmin();
  const parsed = updateOrganizationAccessSchema.safeParse({
    organizationId: formData.get("organizationId"),
    accessUntil: formData.get("accessUntil"),
    mode: formData.get("mode"),
    reason: formData.get("reason") ?? "",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте параметры доступа.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_organization_access", {
      org_id: parsed.data.organizationId,
      target_access_until: parsed.data.accessUntil,
      target_mode: parsed.data.mode,
      change_reason: parsed.data.reason || null,
    });
    if (error) throw error;
  } catch (error) {
    return { status: "error", message: getSafeErrorMessage(error) };
  }

  revalidatePath("/admin/organizations");
  revalidatePath("/dashboard", "layout");
  return { status: "success", message: "Настройки доступа сохранены." };
}
