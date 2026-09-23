"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import {
  odontogramPayloadSchema,
  saveOdontogramFormSchema,
} from "@/modules/odontogram/schemas";
import { requirePermission } from "@/modules/organizations/repository";

export async function saveOdontogram(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("clinical.write");
  const parsedForm = saveOdontogramFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsedForm.success) {
    return { status: "error", message: "Не удалось прочитать данные одонтограммы." };
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(parsedForm.data.payload);
  } catch {
    return { status: "error", message: "Одонтограмма содержит некорректные данные." };
  }

  const parsedPayload = odontogramPayloadSchema.safeParse(rawPayload);
  if (!parsedPayload.success) {
    return { status: "error", message: "Проверьте состояния зубов и поверхностей." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_odontogram", {
    org_id: context.organization.id,
    target_patient_id: parsedForm.data.patientId,
    target_encounter_id: parsedForm.data.encounterId,
    teeth_payload: parsedPayload.data,
  });

  if (error) {
    return { status: "error", message: "Не удалось сохранить одонтограмму." };
  }

  revalidatePath(`/clinical/encounters/${parsedForm.data.encounterId}`);
  revalidatePath(`/patients/${parsedForm.data.patientId}/odontogram`);
  return { status: "success", message: "Новая версия одонтограммы сохранена." };
}
