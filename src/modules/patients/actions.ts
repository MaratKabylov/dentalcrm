"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import { requirePermission } from "@/modules/organizations/repository";
import { createPatientSchema } from "@/modules/patients/schemas";

const createdPatientSchema = z.uuid();

export async function createPatient(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("patients.create");
  const parsed = createPatientSchema.safeParse({
    lastName: formData.get("lastName"),
    firstName: formData.get("firstName"),
    middleName: formData.get("middleName"),
    birthDate: formData.get("birthDate"),
    gender: formData.get("gender"),
    phone: formData.get("phone"),
    iin: formData.get("iin"),
    email: formData.get("email"),
    primaryBranchId: formData.get("primaryBranchId"),
    consentPersonalData: formData.get("consentPersonalData") === "on",
    consentMarketing: formData.get("consentMarketing") === "on",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте заполненные поля.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_patient", {
    org_id: context.organization.id,
    patient_last_name: parsed.data.lastName,
    patient_first_name: parsed.data.firstName,
    patient_middle_name: parsed.data.middleName ?? null,
    patient_birth_date: parsed.data.birthDate ?? null,
    patient_gender: parsed.data.gender ?? null,
    patient_phone: parsed.data.phone,
    patient_iin: parsed.data.iin ?? null,
    patient_email: parsed.data.email ?? null,
    patient_primary_branch_id: parsed.data.primaryBranchId ?? null,
    patient_consent_personal_data: parsed.data.consentPersonalData,
    patient_consent_marketing: parsed.data.consentMarketing,
  });

  if (error) {
    const duplicateMessage = error.code === "23505"
      ? "Пациент с таким ИИН уже существует в этой клинике."
      : "Не удалось создать пациента. Попробуйте ещё раз.";
    return { status: "error", message: duplicateMessage };
  }

  const patientId = createdPatientSchema.safeParse(data);
  if (!patientId.success) {
    return { status: "error", message: "Не удалось открыть созданную карточку." };
  }

  revalidatePath("/patients");
  redirect(`/patients/${patientId.data}`);
}
