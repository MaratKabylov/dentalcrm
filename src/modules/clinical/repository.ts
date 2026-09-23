import { cache } from "react";
import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/organizations/repository";
import type {
  ClinicalEncounter,
  ClinicalEncounterListItem,
} from "@/modules/clinical/types";

const encounterRowSchema = z.object({
  id: z.uuid(),
  branch_id: z.uuid(),
  branch_name: z.string(),
  patient_id: z.uuid(),
  patient_name: z.string(),
  patient_external_number: z.string(),
  appointment_id: z.uuid().nullable(),
  appointment_start_at: z.string().nullable(),
  appointment_status_code: z.string().nullable(),
  doctor_id: z.uuid(),
  doctor_name: z.string(),
  specialization_name: z.string(),
  opened_at: z.string(),
  closed_at: z.string().nullable(),
  chief_complaint: z.string().nullable(),
  anamnesis: z.string().nullable(),
  diagnosis_summary: z.string().nullable(),
  clinical_notes: z.string().nullable(),
  status: z.enum(["open", "closed"]),
});

const encounterListRowSchema = z.object({
  id: z.uuid(),
  patient_id: z.uuid(),
  patient_name: z.string(),
  patient_external_number: z.string(),
  doctor_name: z.string(),
  branch_name: z.string(),
  opened_at: z.string(),
  closed_at: z.string().nullable(),
  status: z.enum(["open", "closed"]),
});

export const getClinicalEncounter = cache(async (
  encounterId: string,
): Promise<ClinicalEncounter | null> => {
  const context = await requirePermission("clinical.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_clinical_encounter", {
    org_id: context.organization.id,
    target_encounter_id: encounterId,
  });

  if (error) {
    throw new AppError("CLINICAL_ENCOUNTER_LOAD_FAILED", "Не удалось загрузить врачебный приём.");
  }

  const parsed = z.array(encounterRowSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new AppError("INVALID_CLINICAL_ENCOUNTER_DATA", "Получены некорректные данные врачебного приёма.");
  }

  const row = parsed.data[0];
  if (!row) return null;

  return {
    id: row.id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    patientId: row.patient_id,
    patientName: row.patient_name,
    patientExternalNumber: row.patient_external_number,
    appointmentId: row.appointment_id,
    appointmentStartAt: row.appointment_start_at,
    appointmentStatusCode: row.appointment_status_code,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    specializationName: row.specialization_name,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    chiefComplaint: row.chief_complaint,
    anamnesis: row.anamnesis,
    diagnosisSummary: row.diagnosis_summary,
    clinicalNotes: row.clinical_notes,
    status: row.status,
  };
});

export async function listClinicalEncounters(): Promise<ClinicalEncounterListItem[]> {
  const context = await requirePermission("clinical.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_clinical_encounters", {
    org_id: context.organization.id,
    result_limit: 50,
  });

  if (error) {
    throw new AppError("CLINICAL_ENCOUNTERS_LOAD_FAILED", "Не удалось загрузить врачебные приёмы.");
  }

  const parsed = z.array(encounterListRowSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new AppError("INVALID_CLINICAL_ENCOUNTERS_DATA", "Получены некорректные данные врачебных приёмов.");
  }

  return parsed.data.map((row) => ({
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    patientExternalNumber: row.patient_external_number,
    doctorName: row.doctor_name,
    branchName: row.branch_name,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    status: row.status,
  }));
}
