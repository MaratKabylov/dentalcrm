import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import type { DiagnosisOption, EncounterDiagnosis } from "@/modules/diagnoses/types";
import { requirePermission } from "@/modules/organizations/repository";

const diagnosisOptionRowSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  system: z.enum(["local", "icd10"]),
});

const encounterDiagnosisRowSchema = z.object({
  id: z.uuid(),
  diagnosis_id: z.uuid(),
  code: z.string(),
  name: z.string(),
  system: z.enum(["local", "icd10"]),
  tooth_code: z.string().nullable(),
  type: z.enum(["primary", "secondary", "differential"]),
  notes: z.string().nullable(),
  created_at: z.string(),
});

export async function listDiagnosisOptions(): Promise<DiagnosisOption[]> {
  const context = await requirePermission("clinical.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_diagnosis_options", {
    org_id: context.organization.id,
  });
  if (error) throw new AppError("DIAGNOSES_LOAD_FAILED", "Не удалось загрузить справочник диагнозов.");
  const parsed = z.array(diagnosisOptionRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_DIAGNOSIS_DATA", "Получены некорректные данные диагнозов.");
  return parsed.data;
}

export async function listEncounterDiagnoses(encounterId: string): Promise<EncounterDiagnosis[]> {
  const context = await requirePermission("clinical.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_encounter_diagnoses", {
    org_id: context.organization.id,
    target_encounter_id: encounterId,
  });
  if (error) throw new AppError("ENCOUNTER_DIAGNOSES_LOAD_FAILED", "Не удалось загрузить диагнозы приёма.");
  const parsed = z.array(encounterDiagnosisRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_ENCOUNTER_DIAGNOSIS_DATA", "Получены некорректные данные диагнозов приёма.");
  return parsed.data.map((row) => ({
    encounterDiagnosisId: row.id,
    id: row.diagnosis_id,
    code: row.code,
    name: row.name,
    system: row.system,
    toothCode: row.tooth_code,
    type: row.type,
    notes: row.notes,
    createdAt: row.created_at,
  }));
}
