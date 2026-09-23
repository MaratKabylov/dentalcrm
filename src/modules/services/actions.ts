"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import { requirePermission } from "@/modules/organizations/repository";
import {
  saveServiceCategorySchema,
  saveServiceSchema,
  setServiceActiveSchema,
} from "@/modules/services/schemas";

export async function saveServiceCategory(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("settings.manage");
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
  const context = await requirePermission("settings.manage");
  const parsed = saveServiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Проверьте параметры услуги.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

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
  });
  if (error) {
    const message = error.code === "23505" ? "Услуга с таким кодом уже существует." : "Не удалось сохранить услугу.";
    return { status: "error", message };
  }

  revalidatePath("/clinical/services");
  return { status: "success", message: "Услуга сохранена." };
}

export async function setServiceActive(formData: FormData) {
  const context = await requirePermission("settings.manage");
  const parsed = setServiceActiveSchema.parse({
    serviceId: formData.get("serviceId"),
    isActive: formData.get("isActive"),
  });
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_service_active", {
    org_id: context.organization.id,
    target_service_id: parsed.serviceId,
    target_is_active: parsed.isActive,
  });
  if (error) throw new Error("Не удалось изменить активность услуги.");
  revalidatePath("/clinical/services");
}
