import { cache } from "react";
import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { consentTypeSchema, documentTypeSchema } from "@/modules/documents/schemas";
import type {
  DocumentTemplate,
  GeneratedDocument,
  GeneratedDocumentSnapshot,
  PatientConsent,
} from "@/modules/documents/types";
import { requirePermission } from "@/modules/organizations/repository";

const documentTemplateRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  document_type: documentTypeSchema,
  consent_type: consentTypeSchema.nullable(),
  title_template: z.string(),
  body_template: z.string(),
  version: z.coerce.number().int().positive(),
  is_active: z.boolean(),
  updated_at: z.string(),
});

const generatedDocumentRowSchema = z.object({
  id: z.uuid(),
  encounter_id: z.uuid().nullable(),
  template_id: z.uuid().nullable(),
  document_type: documentTypeSchema,
  consent_type: consentTypeSchema.nullable(),
  document_number: z.string(),
  status: z.enum(["finalized", "signed"]),
  title: z.string(),
  template_version: z.coerce.number().int().positive().nullable(),
  pdf_size_bytes: z.coerce.number().int().positive(),
  pdf_sha256: z.string(),
  signed_at: z.string().nullable(),
  signed_by_name: z.string().nullable(),
  created_at: z.string(),
  created_by_name: z.string(),
});

const patientConsentRowSchema = z.object({
  id: z.uuid(),
  consent_type: consentTypeSchema,
  version: z.coerce.number().int().positive(),
  status: z.enum(["granted", "revoked"]),
  granted_at: z.string(),
  revoked_at: z.string().nullable(),
  document_id: z.uuid(),
  revocation_reason: z.string().nullable(),
});

const generatedDocumentSnapshotRowSchema = z.object({
  id: z.uuid(),
  patient_id: z.uuid(),
  document_type: documentTypeSchema,
  consent_type: consentTypeSchema.nullable(),
  document_number: z.string(),
  status: z.enum(["finalized", "signed"]),
  title: z.string(),
  rendered_body: z.string(),
  rendered_data: z.record(z.string(), z.unknown()),
  pdf_storage_path: z.string(),
  created_at: z.string(),
});

const storageLocationRowSchema = z.object({
  storage_bucket: z.string(),
  storage_path: z.string(),
  file_name: z.string(),
});

function toTemplate(row: z.infer<typeof documentTemplateRowSchema>): DocumentTemplate {
  return {
    id: row.id,
    name: row.name,
    documentType: row.document_type,
    consentType: row.consent_type,
    titleTemplate: row.title_template,
    bodyTemplate: row.body_template,
    version: row.version,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  };
}

export async function listDocumentTemplates(includeInactive = false): Promise<DocumentTemplate[]> {
  const context = await requirePermission("documents.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_document_templates", {
    org_id: context.organization.id,
    include_inactive: includeInactive,
  });
  if (error) throw new AppError("DOCUMENT_TEMPLATES_LOAD_FAILED", "Не удалось загрузить шаблоны документов.");
  const parsed = z.array(documentTemplateRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_DOCUMENT_TEMPLATE_DATA", "Получены некорректные данные шаблонов документов.");
  return parsed.data.map(toTemplate);
}

export const getDocumentTemplate = cache(async (templateId: string): Promise<DocumentTemplate | null> => {
  const templates = await listDocumentTemplates(true);
  return templates.find((template) => template.id === templateId) ?? null;
});

export async function listPatientDocuments(patientId: string): Promise<GeneratedDocument[]> {
  const context = await requirePermission("documents.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_patient_documents", {
    org_id: context.organization.id,
    target_patient_id: patientId,
  });
  if (error) throw new AppError("PATIENT_DOCUMENTS_LOAD_FAILED", "Не удалось загрузить документы пациента.");
  const parsed = z.array(generatedDocumentRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_PATIENT_DOCUMENT_DATA", "Получены некорректные данные документов пациента.");
  return parsed.data.map((row) => ({
    id: row.id,
    encounterId: row.encounter_id,
    templateId: row.template_id,
    documentType: row.document_type,
    consentType: row.consent_type,
    documentNumber: row.document_number,
    status: row.status,
    title: row.title,
    templateVersion: row.template_version,
    pdfSizeBytes: row.pdf_size_bytes,
    pdfSha256: row.pdf_sha256,
    signedAt: row.signed_at,
    signedByName: row.signed_by_name,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
  }));
}

export async function listPatientConsents(patientId: string): Promise<PatientConsent[]> {
  const context = await requirePermission("documents.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_patient_consents", {
    org_id: context.organization.id,
    target_patient_id: patientId,
  });
  if (error) throw new AppError("PATIENT_CONSENTS_LOAD_FAILED", "Не удалось загрузить согласия пациента.");
  const parsed = z.array(patientConsentRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_PATIENT_CONSENT_DATA", "Получены некорректные данные согласий пациента.");
  return parsed.data.map((row) => ({
    id: row.id,
    consentType: row.consent_type,
    version: row.version,
    status: row.status,
    grantedAt: row.granted_at,
    revokedAt: row.revoked_at,
    documentId: row.document_id,
    revocationReason: row.revocation_reason,
  }));
}

export async function getGeneratedDocumentSnapshot(documentId: string): Promise<GeneratedDocumentSnapshot | null> {
  const context = await requirePermission("documents.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_generated_document_snapshot", {
    org_id: context.organization.id,
    target_document_id: documentId,
  });
  if (error) throw new AppError("DOCUMENT_SNAPSHOT_LOAD_FAILED", "Не удалось загрузить снимок документа.");
  const parsed = z.array(generatedDocumentSnapshotRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new AppError("INVALID_DOCUMENT_SNAPSHOT_DATA", "Получены некорректные данные снимка документа.");
  const row = parsed.data[0];
  return row ? {
    id: row.id,
    patientId: row.patient_id,
    documentType: row.document_type,
    consentType: row.consent_type,
    documentNumber: row.document_number,
    status: row.status,
    title: row.title,
    renderedBody: row.rendered_body,
    renderedData: row.rendered_data,
    pdfStoragePath: row.pdf_storage_path,
    createdAt: row.created_at,
  } : null;
}

export async function getGeneratedDocumentStorageLocation(documentId: string) {
  const context = await requirePermission("documents.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_generated_document_storage_location", {
    org_id: context.organization.id,
    target_document_id: documentId,
  });
  const parsed = z.array(storageLocationRowSchema).safeParse(data ?? []);
  if (error || !parsed.success || !parsed.data[0]) {
    throw new AppError("DOCUMENT_STORAGE_LOCATION_FAILED", "Документ не найден или недоступен.");
  }
  return parsed.data[0];
}
