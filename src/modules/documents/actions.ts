"use server";

import { createHash, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { FormActionState } from "@/modules/auth/types";
import { renderPatientDocumentPdf } from "@/modules/documents/pdf-renderer";
import {
  generateDocumentSchema,
  generatedDocumentIdSchema,
  revokeConsentSchema,
  saveDocumentTemplateSchema,
  setDocumentTemplateActiveSchema,
  signDocumentSchema,
} from "@/modules/documents/schemas";
import {
  getDocumentTemplate,
  getGeneratedDocumentSnapshot,
  getGeneratedDocumentStorageLocation,
} from "@/modules/documents/repository";
import { renderDocumentTemplate } from "@/modules/documents/template-renderer";
import { requirePermission } from "@/modules/organizations/repository";
import { getPatient } from "@/modules/patients/repository";

const DOCUMENT_BUCKET = "patient-documents";
const registeredDocumentSchema = z.uuid();
const revokedConsentPatientSchema = z.uuid();

function pdfHash(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function documentNumber(id: string, date: Date) {
  return `DOC-${date.getUTCFullYear()}-${id.slice(0, 8).toUpperCase()}`;
}

function patientFullName(patient: NonNullable<Awaited<ReturnType<typeof getPatient>>>) {
  return [patient.lastName, patient.firstName, patient.middleName].filter(Boolean).join(" ");
}

export async function saveDocumentTemplate(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("documents.manage");
  const parsed = saveDocumentTemplateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте содержимое шаблона.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_document_template", {
    org_id: context.organization.id,
    target_template_id: parsed.data.templateId ?? null,
    template_name: parsed.data.name,
    template_document_type: parsed.data.documentType,
    template_consent_type: parsed.data.consentType ?? null,
    template_title: parsed.data.titleTemplate,
    template_body: parsed.data.bodyTemplate,
  });
  if (error) {
    return {
      status: "error",
      message: error.code === "23505"
        ? "Шаблон с таким названием уже существует."
        : "Не удалось сохранить шаблон документа.",
    };
  }
  revalidatePath("/documents/templates");
  revalidatePath("/documents");
  return { status: "success", message: "Шаблон документа сохранён." };
}

export async function setDocumentTemplateActive(formData: FormData): Promise<void> {
  const context = await requirePermission("documents.manage");
  const parsed = setDocumentTemplateActiveSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_document_template_active", {
    org_id: context.organization.id,
    target_template_id: parsed.templateId,
    target_is_active: parsed.isActive,
  });
  if (error) throw new Error("Не удалось изменить активность шаблона.");
  revalidatePath("/documents/templates");
  revalidatePath("/documents");
}

export async function generatePatientDocument(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("documents.manage");
  const parsed = generateDocumentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Выберите корректный шаблон документа." };

  const [template, patient] = await Promise.all([
    getDocumentTemplate(parsed.data.templateId),
    getPatient(parsed.data.patientId),
  ]);
  if (!template || !template.isActive) return { status: "error", message: "Шаблон документа недоступен." };
  if (!patient) return { status: "error", message: "Пациент не найден." };

  const id = randomUUID();
  const createdAt = new Date();
  const number = documentNumber(id, createdAt);
  const dateLabel = new Intl.DateTimeFormat(context.organization.locale || "ru-RU", {
    dateStyle: "long",
    timeZone: context.organization.timezone,
  }).format(createdAt);
  const fullName = patientFullName(patient);
  const variables = {
    organization_name: context.organization.name,
    patient_full_name: fullName,
    patient_birth_date: patient.birthDate ?? "не указана",
    patient_iin: patient.iin ?? "не указан",
    patient_phone: patient.phone,
    patient_email: patient.email ?? "не указан",
    document_date: dateLabel,
    document_number: number,
  };
  const renderedTitle = renderDocumentTemplate(template.titleTemplate, variables);
  const renderedBody = renderDocumentTemplate(template.bodyTemplate, variables);
  const unresolved = [...new Set([...renderedTitle.unresolved, ...renderedBody.unresolved])];
  if (unresolved.length > 0) {
    return { status: "error", message: `В шаблоне остались неизвестные переменные: ${unresolved.join(", ")}.` };
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await renderPatientDocumentPdf({
      organizationName: context.organization.name,
      patientName: fullName,
      documentNumber: number,
      title: renderedTitle.rendered,
      body: renderedBody.rendered,
      createdAt,
      locale: context.organization.locale,
      timeZone: context.organization.timezone,
      showPatientSignatureLine: template.consentType !== null,
    });
  } catch {
    return { status: "error", message: "Не удалось сформировать PDF. Проверьте текст шаблона." };
  }
  if (pdfBytes.byteLength > 10 * 1024 * 1024) return { status: "error", message: "PDF превышает допустимый размер 10 МБ." };

  const storagePath = `${context.organization.id}/${patient.id}/${id}/generated.pdf`;
  const supabase = await createClient();
  const upload = await supabase.storage.from(DOCUMENT_BUCKET).upload(storagePath, Buffer.from(pdfBytes), {
    contentType: "application/pdf",
    cacheControl: "3600",
    upsert: false,
  });
  if (upload.error) return { status: "error", message: "Не удалось сохранить PDF в защищённом хранилище." };

  const snapshot = {
    ...variables,
    template_id: template.id,
    template_name: template.name,
    template_version: template.version,
    rendered_at: createdAt.toISOString(),
  };
  const { data, error } = await supabase.rpc("register_generated_document", {
    org_id: context.organization.id,
    target_document_id: id,
    target_patient_id: patient.id,
    target_encounter_id: parsed.data.encounterId ?? null,
    source_template_id: template.id,
    generated_document_type: template.documentType,
    generated_consent_type: template.consentType,
    generated_document_number: number,
    generated_title: renderedTitle.rendered,
    generated_body: renderedBody.rendered,
    generated_data: snapshot,
    source_template_version: template.version,
    generated_pdf_storage_path: storagePath,
    generated_pdf_size_bytes: pdfBytes.byteLength,
    generated_pdf_sha256: pdfHash(pdfBytes),
  });
  const registered = registeredDocumentSchema.safeParse(data);
  if (error || !registered.success) {
    await supabase.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
    return { status: "error", message: "Не удалось зарегистрировать снимок документа." };
  }

  revalidatePath(`/patients/${patient.id}`);
  revalidatePath(`/patients/${patient.id}/documents`);
  redirect(`/patients/${patient.id}/documents`);
}

export async function signPatientDocument(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("documents.manage");
  const parsed = signDocumentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Подтвердите подписание и укажите имя пациента.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const snapshot = await getGeneratedDocumentSnapshot(parsed.data.documentId);
  if (!snapshot) return { status: "error", message: "Документ не найден." };
  if (snapshot.status === "signed") return { status: "error", message: "Документ уже подписан." };

  const signedAt = new Date();
  const patientName = typeof snapshot.renderedData.patient_full_name === "string"
    ? snapshot.renderedData.patient_full_name
    : parsed.data.signerName;
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await renderPatientDocumentPdf({
      organizationName: context.organization.name,
      patientName,
      documentNumber: snapshot.documentNumber,
      title: snapshot.title,
      body: snapshot.renderedBody,
      createdAt: new Date(snapshot.createdAt),
      locale: context.organization.locale,
      timeZone: context.organization.timezone,
      signed: { name: parsed.data.signerName, at: signedAt },
    });
  } catch {
    return { status: "error", message: "Не удалось сформировать подписанный PDF." };
  }

  const signedPath = `${context.organization.id}/${snapshot.patientId}/${snapshot.id}/signed.pdf`;
  const supabase = await createClient();
  const upload = await supabase.storage.from(DOCUMENT_BUCKET).upload(signedPath, Buffer.from(pdfBytes), {
    contentType: "application/pdf",
    cacheControl: "3600",
    upsert: false,
  });
  if (upload.error) return { status: "error", message: "Не удалось сохранить подписанный PDF." };

  const { error } = await supabase.rpc("sign_generated_document", {
    org_id: context.organization.id,
    target_document_id: snapshot.id,
    signer_name: parsed.data.signerName,
    signed_pdf_storage_path: signedPath,
    signed_pdf_size_bytes: pdfBytes.byteLength,
    signed_pdf_sha256: pdfHash(pdfBytes),
  });
  if (error) {
    await supabase.storage.from(DOCUMENT_BUCKET).remove([signedPath]);
    return { status: "error", message: "Не удалось зарегистрировать подпись пациента." };
  }
  await supabase.storage.from(DOCUMENT_BUCKET).remove([snapshot.pdfStoragePath]);

  revalidatePath(`/patients/${snapshot.patientId}`);
  revalidatePath(`/patients/${snapshot.patientId}/documents`);
  return { status: "success", message: "Подписанный снимок сохранён. Документ больше не изменяется." };
}

export async function revokePatientConsent(
  _state: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requirePermission("documents.manage");
  const parsed = revokeConsentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Укажите причину отзыва согласия.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_patient_consent", {
    org_id: context.organization.id,
    target_consent_id: parsed.data.consentId,
    revocation_reason_text: parsed.data.reason,
  });
  const patientId = revokedConsentPatientSchema.safeParse(data);
  if (error || !patientId.success) return { status: "error", message: "Не удалось отозвать согласие." };
  revalidatePath(`/patients/${patientId.data}`);
  revalidatePath(`/patients/${patientId.data}/documents`);
  return { status: "success", message: "Согласие отозвано. Подписанный документ сохранён в истории." };
}

async function redirectToDocument(formData: FormData, download: boolean) {
  const parsed = generatedDocumentIdSchema.parse(Object.fromEntries(formData));
  const location = await getGeneratedDocumentStorageLocation(parsed.documentId);
  const supabase = await createClient();
  const signed = await supabase.storage.from(location.storage_bucket).createSignedUrl(
    location.storage_path,
    60,
    download ? { download: location.file_name } : undefined,
  );
  if (signed.error || !signed.data.signedUrl) throw new Error("Не удалось подготовить защищённую ссылку на документ.");
  redirect(signed.data.signedUrl);
}

export async function viewGeneratedDocument(formData: FormData) {
  await requirePermission("documents.read");
  return redirectToDocument(formData, false);
}

export async function downloadGeneratedDocument(formData: FormData) {
  await requirePermission("documents.read");
  return redirectToDocument(formData, true);
}
