export const ATTACHMENT_MEDIA_TYPES = [
  "xray",
  "photo",
  "scan",
  "ct",
  "document",
  "other",
] as const;

export type AttachmentMediaType = (typeof ATTACHMENT_MEDIA_TYPES)[number];

export type PatientAttachment = {
  id: string;
  encounterId: string | null;
  treatmentPlanId: string | null;
  entityType: "patient" | "encounter" | "treatment_plan";
  mediaType: AttachmentMediaType;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  description: string | null;
  createdAt: string;
};
