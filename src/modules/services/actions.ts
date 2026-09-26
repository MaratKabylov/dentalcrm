"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import { requireBranchPermission, requirePermission } from "@/modules/organizations/repository";
import {
  saveServiceCategorySchema,
  saveServiceSchema,
  saveServiceBranchOverrideSchema,
  setServiceActiveSchema,
} from "@/modules/services/schemas";

export async function saveServiceCategory(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("directories.manage_global");
  const parsed = saveServiceCategorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Проверьте параметры категории.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_service_category", {
    org_id: context.organization.id,
    target_category_id: parsed.data.categoryId ?? null,
    category_parent_id: parsed.data.parentId ?? null,
    category_name: parsed.data.name,
    category_sort_order: parsed.data.sortOrder,
  });
  if (error) {
    const message = error.code === "23505" ? "Категория с таким названием уже существует." : "Не удалось сохранить категорию.";
    return { status: "error", message };
  }

  revalidatePath("/clinical/services");
  return { status: "success", message: "Категория сохранена." };
}

export async function saveService(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = saveServiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Проверьте параметры услуги.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const context = parsed.data.scope === "organization"
    ? await requirePermission("directories.manage_global")
    : await requireBranchPermission("directories.manage_branch", parsed.data.branchId!);

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_service", {
    org_id: context.organization.id,
    target_service_id: parsed.data.serviceId ?? null,
    service_category_id: parsed.data.categoryId,
    service_code: parsed.data.code,
    service_name: parsed.data.name,
    service_duration_minutes: parsed.data.durationMinutes,
    service_base_price: parsed.data.basePrice,
    service_cost_price: parsed.data.costPrice ?? null,
    service_vat_rate: parsed.data.vatRate ?? null,
    service_scope: parsed.data.scope,
    service_branch_id: parsed.data.branchId ?? null,
    price_valid_from: parsed.data.priceValidFrom,
  });
  if (error) {
    const message = error.code === "23505" ? "Услуга с таким кодом уже существует." : "Не удалось сохранить услугу.";
    return { status: "error", message };
  }

  revalidatePath("/clinical/services");
  return { status: "success", message: "Услуга сохранена." };
}

export async function saveServiceBranchOverride(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = saveServiceBranchOverrideSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Проверьте филиальную настройку.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const context = await requireBranchPermission("directories.manage_branch", parsed.data.branchId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_service_branch_override", {
    org_id: context.organization.id,
    target_service_id: parsed.data.serviceId,
    target_branch_id: parsed.data.branchId,
    service_is_available: parsed.data.isAvailable,
    service_duration_minutes: parsed.data.durationMinutes ?? null,
    service_price: parsed.data.price ?? null,
    price_valid_from: parsed.data.priceValidFrom,
  });
  if (error) return { status: "error", message: "Не удалось сохранить филиальную настройку." };
  revalidatePath("/clinical/services");
  return { status: "success", message: "Филиальная настройка сохранена." };
}

export async function setServiceActive(formData: FormData) {
  const parsed = setServiceActiveSchema.parse({
    serviceId: formData.get("serviceId"),
    isActive: formData.get("isActive"),
    scope: formData.get("scope"),
    branchId: formData.get("branchId"),
  });
  const context = parsed.scope === "organization"
    ? await requirePermission("directories.manage_global")
    : await requireBranchPermission("directories.manage_branch", parsed.branchId!);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_service_active", {
    org_id: context.organization.id,
    target_service_id: parsed.serviceId,
    target_is_active: parsed.isActive,
  });
  if (error) throw new Error("Не удалось изменить активность услуги.");
  revalidatePath("/clinical/services");
}
