import { cache } from "react";
import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/organizations/repository";
import type {
  BranchOption,
  PatientDetails,
  PatientListItem,
} from "@/modules/patients/types";

const patientListRowSchema = z.object({
  id: z.uuid(),
  external_number: z.string(),
  last_name: z.string(),
  first_name: z.string(),
  middle_name: z.string().nullable(),
  birth_date: z.string().nullable(),
  phone: z.string(),
  phone_normalized: z.string(),
  iin: z.string().nullable(),
  archived_at: z.string().nullable(),
});

const patientDetailsRowSchema = patientListRowSchema.extend({
  email: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  notes: z.string().nullable(),
  gender: z.enum(["male", "female"]).nullable(),
  consent_personal_data: z.boolean(),
  consent_marketing: z.boolean(),
  created_at: z.string(),
  branches: z.object({ id: z.uuid(), name: z.string() }).nullable(),
});

const branchRowSchema = z.object({ id: z.uuid(), name: z.string() });

function toListItem(row: z.infer<typeof patientListRowSchema>): PatientListItem {
  return {
    id: row.id,
    externalNumber: row.external_number,
    lastName: row.last_name,
    firstName: row.first_name,
    middleName: row.middle_name,
    birthDate: row.birth_date,
    phone: row.phone,
    phoneNormalized: row.phone_normalized,
    iin: row.iin,
  };
}

export async function listPatients(search = ""): Promise<PatientListItem[]> {
  const context = await requirePermission("patients.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_patients", {
    org_id: context.organization.id,
    search_text: search.trim(),
    result_limit: 50,
  });

  if (error) {
    throw new AppError("PATIENTS_LOAD_FAILED", "Не удалось загрузить пациентов.");
  }

  const parsed = z.array(patientListRowSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new AppError("INVALID_PATIENT_DATA", "Получены некорректные данные пациентов.");
  }

  return parsed.data.map(toListItem);
}

export const getPatient = cache(async (patientId: string): Promise<PatientDetails | null> => {
  const context = await requirePermission("patients.read");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patients")
    .select(
      "id, external_number, last_name, first_name, middle_name, birth_date, phone, phone_normalized, iin, archived_at, email, address, city, notes, gender, consent_personal_data, consent_marketing, created_at, branches(id, name)",
    )
    .eq("organization_id", context.organization.id)
    .eq("id", patientId)
    .is("archived_at", null)
    .maybeSingle();

  if (error) {
    throw new AppError("PATIENT_LOAD_FAILED", "Не удалось загрузить карточку пациента.");
  }
  if (!data) return null;

  const parsed = patientDetailsRowSchema.safeParse(data);
  if (!parsed.success) {
    throw new AppError("INVALID_PATIENT_DATA", "Получены некорректные данные пациента.");
  }

  return {
    ...toListItem(parsed.data),
    email: parsed.data.email,
    address: parsed.data.address,
    city: parsed.data.city,
    notes: parsed.data.notes,
    gender: parsed.data.gender,
    consentPersonalData: parsed.data.consent_personal_data,
    consentMarketing: parsed.data.consent_marketing,
    createdAt: parsed.data.created_at,
    primaryBranch: parsed.data.branches,
  };
});

export async function listPatientBranchOptions(): Promise<BranchOption[]> {
  const context = await requirePermission("patients.create");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .select("id, name")
    .eq("organization_id", context.organization.id)
    .eq("is_active", true)
    .order("name");

  if (error) {
    throw new AppError("BRANCHES_LOAD_FAILED", "Не удалось загрузить филиалы.");
  }

  const parsed = z.array(branchRowSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new AppError("INVALID_BRANCH_DATA", "Получены некорректные данные филиалов.");
  }

  return parsed.data;
}
