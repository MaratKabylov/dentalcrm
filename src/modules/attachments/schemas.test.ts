import { describe, expect, it } from "vitest";

import { archiveAttachmentSchema, uploadAttachmentMetadataSchema } from "./schemas";

const patientId = "6f6073d3-0ba8-4bf4-943d-f819df3d4f31";
const encounterId = "a75eb15e-69c3-443a-a583-879067b4fdcb";

describe("uploadAttachmentMetadataSchema", () => {
  it("accepts a patient or encounter attachment", () => {
    expect(uploadAttachmentMetadataSchema.safeParse({ patientId, encounterId: "", mediaType: "photo", description: "" }).success).toBe(true);
    expect(uploadAttachmentMetadataSchema.safeParse({ patientId, encounterId, mediaType: "xray", description: "Прицельный снимок" }).success).toBe(true);
  });

  it("rejects an unsupported media category", () => {
    expect(uploadAttachmentMetadataSchema.safeParse({ patientId, encounterId: "", mediaType: "dicom", description: "" }).success).toBe(false);
  });
});

describe("archiveAttachmentSchema", () => {
  it("requires a meaningful reason", () => {
    expect(archiveAttachmentSchema.safeParse({ attachmentId: encounterId, reason: "" }).success).toBe(false);
  });
});
