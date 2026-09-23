"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import {
  saveClinicalEncounterSchema,
  startClinicalEncounterSchema,
} from "@/modules/clinical/schemas";
import { requirePermission } from "@/modules/organizations/repository";

export async function startClinicalEncounter(formData: FormData) {
  const context = await requirePermission("clinical.write");
  const parsed = startClinicalEncounterSchema.parse({
    appointmentId: formData.get("appointmentId"),
  });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_clinical_encounter", {
    org_id: context.organization.id,
    target_appointment_id: parsed.appointmentId,
  });

  if (error) throw new Error("Не удалось начать врачебный приём.");
  const encounterId = z.uuid().parse(data);
  revalidatePath("/calendar");
  revalidatePath("/clinical");
  redirect(`/clinical/encounters/${encounterId}`);
}

export async function saveClinicalEncounter(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("clinical.write");
  const parsed = saveClinicalEncounterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте заполненные поля.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_clinical_encounter", {
    org_id: context.organization.id,
    target_encounter_id: parsed.data.encounterId,
    encounter_chief_complaint: parsed.data.chiefComplaint ?? null,
    encounter_anamnesis: parsed.data.anamnesis ?? null,
    encounter_diagnosis_summary: parsed.data.diagnosisSummary ?? null,
    encounter_clinical_notes: parsed.data.clinicalNotes ?? null,
    close_encounter: parsed.data.intent === "close",
  });

  if (error) {
    return { status: "error", message: "Не удалось сохранить данные врачебного приёма." };
  }

  revalidatePath(`/clinical/encounters/${parsed.data.encounterId}`);
  revalidatePath("/clinical");
  revalidatePath("/calendar");

  if (parsed.data.intent === "close") {
    redirect(`/clinical/encounters/${parsed.data.encounterId}?closed=1`);
  }

  return { status: "success", message: "Данные приёма сохранены." };
}
