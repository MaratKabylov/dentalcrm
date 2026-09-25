export const DOCUMENT_TYPES = [
  "informed_consent",
  "treatment_agreement",
  "treatment_plan",
  "act",
  "recommendations",
  "certificate",
  "prescription",
  "custom",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const CONSENT_TYPES = [
  "personal_data",
  "medical_treatment",
  "marketing",
  "photo",
  "communication",
] as const;

export type ConsentType = (typeof CONSENT_TYPES)[number];

export type DocumentTemplate = {
  id: string;
  name: string;
  documentType: DocumentType;
  consentType: ConsentType | null;
  titleTemplate: string;
  bodyTemplate: string;
  version: number;
  isActive: boolean;
  updatedAt: string;
};

export type GeneratedDocument = {
  id: string;
  encounterId: string | null;
  templateId: string | null;
  documentType: DocumentType;
  consentType: ConsentType | null;
  documentNumber: string;
  status: "finalized" | "signed";
  title: string;
  templateVersion: number | null;
  pdfSizeBytes: number;
  pdfSha256: string;
  signedAt: string | null;
  signedByName: string | null;
  createdAt: string;
  createdByName: string;
};

export type PatientConsent = {
  id: string;
  consentType: ConsentType;
  version: number;
  status: "granted" | "revoked";
  grantedAt: string;
  revokedAt: string | null;
  documentId: string;
  revocationReason: string | null;
};

export type GeneratedDocumentSnapshot = {
  id: string;
  patientId: string;
  documentType: DocumentType;
  consentType: ConsentType | null;
  documentNumber: string;
  status: "finalized" | "signed";
  title: string;
  renderedBody: string;
  renderedData: Record<string, unknown>;
  pdfStoragePath: string;
  createdAt: string;
};
