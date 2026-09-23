import { z } from "zod";

import { ATTACHMENT_MEDIA_TYPES } from "./types";

const optionalUuid = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.uuid().optional(),
);

const optionalText = (maximum: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().max(maximum).optional(),
);

export const uploadAttachmentMetadataSchema = z.object({
  patientId: z.uuid(),
  encounterId: optionalUuid,
  mediaType: z.enum(ATTACHMENT_MEDIA_TYPES),
  description: optionalText(1000),
});

export const attachmentIdSchema = z.object({ attachmentId: z.uuid() });

export const archiveAttachmentSchema = z.object({
  attachmentId: z.uuid(),
  reason: z.string().trim().min(3, "Укажите причину архивирования.").max(500),
});
