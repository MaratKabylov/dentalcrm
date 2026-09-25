import { z } from "zod";

import { CONSENT_TYPES, DOCUMENT_TYPES } from "./types";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);
export const consentTypeSchema = z.enum(CONSENT_TYPES);

export const saveDocumentTemplateSchema = z.object({
  templateId: z.preprocess(emptyToUndefined, z.uuid().optional()),
  name: z.string().trim().min(2, "Укажите название шаблона.").max(160),
  documentType: documentTypeSchema,
  consentType: z.preprocess(emptyToUndefined, consentTypeSchema.optional()),
  titleTemplate: z.string().trim().min(2, "Укажите заголовок документа.").max(240),
  bodyTemplate: z.string().trim().min(10, "Добавьте текст документа.").max(50000),
});

export const setDocumentTemplateActiveSchema = z.object({
  templateId: z.uuid(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const generateDocumentSchema = z.object({
  patientId: z.uuid(),
  templateId: z.uuid(),
  encounterId: z.preprocess(emptyToUndefined, z.uuid().optional()),
});

export const signDocumentSchema = z.object({
  documentId: z.uuid(),
  signerName: z.string().trim().min(2, "Укажите имя подписанта.").max(200),
  confirmation: z.literal("on", { error: "Подтвердите согласие пациента." }),
});

export const revokeConsentSchema = z.object({
  consentId: z.uuid(),
  reason: z.string().trim().min(3, "Укажите причину отзыва.").max(500),
});

export const generatedDocumentIdSchema = z.object({ documentId: z.uuid() });
