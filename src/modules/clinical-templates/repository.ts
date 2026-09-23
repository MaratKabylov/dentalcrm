import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import type { ClinicalTemplate } from "@/modules/clinical-templates/types";
import { getOrganizationContext } from "@/modules/organizations/repository";

const clinicalTemplateRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  chief_complaint: z.string().nullable(),
  anamnesis: z.string().nullable(),
  diagnosis_summary: z.string().nullable(),
  clinical_notes: z.string().nullable(),
  is_active: z.boolean(),
  updated_at: z.string(),
});

export async function listClinicalTemplates(): Promise<ClinicalTemplate[]> {
  const context = await getOrganizationContext();
  if (!context || (!context.can("clinical.read") && !context.can("settings.manage"))) {
    throw new AppError("FORBIDDEN", "Недостаточно прав для просмотра клинических шаблонов.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_clinical_templates", {
    org_id: context.organization.id,
  });
  if (error) {
    throw new AppError(
      "CLINICAL_TEMPLATES_LOAD_FAILED",
      "Не удалось загрузить клинические шаблоны.",
    );
  }

  const parsed = z.array(clinicalTemplateRowSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new AppError(
      "INVALID_CLINICAL_TEMPLATE_DATA",
      "Получены некорректные данные клинических шаблонов.",
    );
  }

  return parsed.data.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    chiefComplaint: row.chief_complaint,
    anamnesis: row.anamnesis,
    diagnosisSummary: row.diagnosis_summary,
    clinicalNotes: row.clinical_notes,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  }));
}
