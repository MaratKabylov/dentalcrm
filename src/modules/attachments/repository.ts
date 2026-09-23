import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import type { PatientAttachment } from "@/modules/attachments/types";
import { requirePermission } from "@/modules/organizations/repository";

const attachmentRowSchema = z.object({
  id: z.uuid(),
  encounter_id: z.uuid().nullable(),
  treatment_plan_id: z.uuid().nullable(),
  entity_type: z.enum(["patient", "encounter", "treatment_plan"]),
  media_type: z.enum(["xray", "photo", "scan", "ct", "document", "other"]),
  mime_type: z.string(),
  file_name: z.string(),
  size_bytes: z.coerce.number().int(),
  description: z.string().nullable(),
  created_at: z.string(),
});

export async function listPatientAttachments(
  patientId: string,
  encounterId?: string,
): Promise<PatientAttachment[]> {
  const context = await requirePermission("clinical.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_patient_attachments", {
    org_id: context.organization.id,
    target_patient_id: patientId,
    target_encounter_id: encounterId ?? null,
  });
  if (error) {
    throw new AppError("ATTACHMENTS_LOAD_FAILED", "Не удалось загрузить вложения пациента.");
  }

  const parsed = z.array(attachmentRowSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new AppError("INVALID_ATTACHMENT_DATA", "Получены некорректные данные вложений.");
  }

  return parsed.data.map((row) => ({
    id: row.id,
    encounterId: row.encounter_id,
    treatmentPlanId: row.treatment_plan_id,
    entityType: row.entity_type,
    mediaType: row.media_type,
    mimeType: row.mime_type,
    fileName: row.file_name,
    sizeBytes: row.size_bytes,
    description: row.description,
    createdAt: row.created_at,
  }));
}
