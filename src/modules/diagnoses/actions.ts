"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import {
  addEncounterDiagnosisSchema,
  removeEncounterDiagnosisSchema,
} from "@/modules/diagnoses/schemas";
import { requirePermission } from "@/modules/organizations/repository";

export async function addEncounterDiagnosis(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("clinical.write");
  const parsed = addEncounterDiagnosisSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте параметры диагноза.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_encounter_diagnosis", {
    org_id: context.organization.id,
    target_encounter_id: parsed.data.encounterId,
    selected_diagnosis_id: parsed.data.diagnosisId ?? null,
    diagnosis_code: parsed.data.code ?? null,
    diagnosis_name: parsed.data.name ?? null,
    diagnosis_system: parsed.data.system,
    target_tooth_code: parsed.data.toothCode ?? null,
    diagnosis_type: parsed.data.type,
    diagnosis_notes: parsed.data.notes ?? null,
  });

  if (error) return { status: "error", message: "Не удалось сохранить диагноз." };
  revalidatePath(`/clinical/encounters/${parsed.data.encounterId}`);
  return { status: "success", message: "Диагноз добавлен к приёму." };
}

export async function removeEncounterDiagnosis(formData: FormData) {
  const context = await requirePermission("clinical.write");
  const parsed = removeEncounterDiagnosisSchema.parse({
    encounterDiagnosisId: formData.get("encounterDiagnosisId"),
    encounterId: formData.get("encounterId"),
  });
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_encounter_diagnosis", {
    org_id: context.organization.id,
    target_encounter_diagnosis_id: parsed.encounterDiagnosisId,
  });
  if (error) throw new Error("Не удалось удалить диагноз из приёма.");
  revalidatePath(`/clinical/encounters/${parsed.encounterId}`);
}
