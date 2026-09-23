"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  attachmentExtension,
  hasAllowedAttachmentSignature,
  validateAttachmentFile,
} from "@/modules/attachments/file-validation";
import {
  archiveAttachmentSchema,
  attachmentIdSchema,
  uploadAttachmentMetadataSchema,
} from "@/modules/attachments/schemas";
import type { FormActionState } from "@/modules/auth/types";
import { requirePermission } from "@/modules/organizations/repository";

const storageLocationRowSchema = z.object({
  storage_bucket: z.string(),
  storage_path: z.string(),
  file_name: z.string(),
});

const archivedAttachmentRowSchema = z.object({
  patient_id: z.uuid(),
  encounter_id: z.uuid().nullable(),
});

export async function uploadAttachment(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("clinical.write");
  const parsed = uploadAttachmentMetadataSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте параметры вложения.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return {
      status: "error",
      message: "Выберите файл для загрузки.",
      fieldErrors: { file: ["Выберите файл для загрузки."] },
    };
  }
  const fileError = validateAttachmentFile(file);
  if (fileError) {
    return {
      status: "error",
      message: "Файл не прошёл проверку.",
      fieldErrors: { file: [fileError] },
    };
  }
  const signature = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!hasAllowedAttachmentSignature(file.type, signature)) {
    return {
      status: "error",
      message: "Файл не прошёл проверку.",
      fieldErrors: { file: ["Содержимое файла не соответствует заявленному формату."] },
    };
  }

  const fileName = file.name.trim();
  const storagePath = [
    context.organization.id,
    parsed.data.patientId,
    `${randomUUID()}.${attachmentExtension(file.type)}`,
  ].join("/");
  const supabase = await createClient();
  const uploadResult = await supabase.storage
    .from("clinical-attachments")
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
  if (uploadResult.error) {
    return { status: "error", message: "Не удалось загрузить файл в защищённое хранилище." };
  }

  const entityType = parsed.data.encounterId ? "encounter" : "patient";
  const entityId = parsed.data.encounterId ?? parsed.data.patientId;
  const { error } = await supabase.rpc("register_attachment", {
    org_id: context.organization.id,
    target_patient_id: parsed.data.patientId,
    target_encounter_id: parsed.data.encounterId ?? null,
    target_treatment_plan_id: null,
    attachment_entity_type: entityType,
    attachment_entity_id: entityId,
    attachment_media_type: parsed.data.mediaType,
    attachment_storage_path: storagePath,
    attachment_mime_type: file.type,
    attachment_file_name: fileName,
    attachment_size_bytes: file.size,
    attachment_description: parsed.data.description ?? null,
  });
  if (error) {
    await supabase.storage.from("clinical-attachments").remove([storagePath]);
    return { status: "error", message: "Не удалось зарегистрировать вложение пациента." };
  }

  revalidatePath(`/patients/${parsed.data.patientId}`);
  if (parsed.data.encounterId) {
    revalidatePath(`/clinical/encounters/${parsed.data.encounterId}`);
  }
  return { status: "success", message: "Файл добавлен в медицинскую карту." };
}

export async function downloadAttachment(formData: FormData) {
  const context = await requirePermission("clinical.read");
  const parsed = attachmentIdSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_attachment_storage_location", {
    org_id: context.organization.id,
    target_attachment_id: parsed.attachmentId,
  });
  const location = z.array(storageLocationRowSchema).safeParse(data ?? []);
  if (error || !location.success || !location.data[0]) {
    throw new Error("Вложение не найдено или недоступно.");
  }

  const attachment = location.data[0];
  const signed = await supabase.storage
    .from(attachment.storage_bucket)
    .createSignedUrl(attachment.storage_path, 60, { download: attachment.file_name });
  if (signed.error || !signed.data.signedUrl) {
    throw new Error("Не удалось подготовить защищённую ссылку на файл.");
  }
  redirect(signed.data.signedUrl);
}

export async function archiveAttachment(formData: FormData) {
  const context = await requirePermission("clinical.write");
  const parsed = archiveAttachmentSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("archive_attachment", {
    org_id: context.organization.id,
    target_attachment_id: parsed.attachmentId,
    archive_reason_text: parsed.reason,
  });
  const archived = z.array(archivedAttachmentRowSchema).safeParse(data ?? []);
  if (error || !archived.success || !archived.data[0]) {
    throw new Error("Не удалось архивировать вложение.");
  }

  revalidatePath(`/patients/${archived.data[0].patient_id}`);
  if (archived.data[0].encounter_id) {
    revalidatePath(`/clinical/encounters/${archived.data[0].encounter_id}`);
  }
}
