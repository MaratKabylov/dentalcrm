import type { ConsentType, DocumentType } from "@/modules/documents/types";

export const documentTypeLabels: Record<DocumentType, string> = {
  informed_consent: "Информированное согласие",
  treatment_agreement: "Договор на лечение",
  treatment_plan: "План лечения",
  act: "Акт",
  recommendations: "Рекомендации",
  certificate: "Справка",
  prescription: "Назначение",
  custom: "Другой документ",
};

export const consentTypeLabels: Record<ConsentType, string> = {
  personal_data: "Персональные данные",
  medical_treatment: "Медицинское вмешательство",
  marketing: "Маркетинговые сообщения",
  photo: "Фото- и видеосъёмка",
  communication: "Электронные коммуникации",
};

export const documentTemplateVariables = [
  "organization_name",
  "patient_full_name",
  "patient_birth_date",
  "patient_iin",
  "patient_phone",
  "patient_email",
  "document_date",
  "document_number",
] as const;
