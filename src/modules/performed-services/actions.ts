"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import { requirePermission } from "@/modules/organizations/repository";
import {
  addPerformedServiceSchema,
  voidPerformedServiceSchema,
} from "@/modules/performed-services/schemas";

export async function addPerformedService(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("clinical.write");
  const parsed = addPerformedServiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте параметры выполненной процедуры.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_performed_service", {
    org_id: context.organization.id,
    target_encounter_id: parsed.data.encounterId,
    target_service_id: parsed.data.serviceId ?? null,
    target_plan_item_id: parsed.data.treatmentPlanItemId ?? null,
    target_tooth_code: parsed.data.toothCode ?? null,
    service_quantity: parsed.data.quantity,
    service_discount_amount: parsed.data.discountAmount,
    service_notes: parsed.data.notes ?? null,
  });
  if (error) {
    return {
      status: "error",
      message: "Не удалось добавить процедуру. Проверьте остаток по плану и параметры услуги.",
    };
  }

  revalidatePath(`/clinical/encounters/${parsed.data.encounterId}`);
  return { status: "success", message: "Выполненная процедура добавлена." };
}

export async function voidPerformedService(formData: FormData) {
  const context = await requirePermission("clinical.write");
  const parsed = voidPerformedServiceSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_performed_service", {
    org_id: context.organization.id,
    target_performed_service_id: parsed.performedServiceId,
    void_reason_text: parsed.reason,
  });
  if (error) throw new Error("Не удалось аннулировать выполненную процедуру.");
  revalidatePath(`/clinical/encounters/${parsed.encounterId}`);
}
