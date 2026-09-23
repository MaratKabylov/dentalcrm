import { describe, expect, it } from "vitest";

import {
  hasAllowedAttachmentSignature,
  MAX_ATTACHMENT_SIZE_BYTES,
  validateAttachmentFile,
} from "./file-validation";

describe("validateAttachmentFile", () => {
  it("accepts an image within the limit", () => {
    expect(validateAttachmentFile({ name: "рентген 11.jpg", type: "image/jpeg", size: 2048 })).toBeNull();
  });

  it("rejects oversized and executable files", () => {
    expect(validateAttachmentFile({ name: "scan.pdf", type: "application/pdf", size: MAX_ATTACHMENT_SIZE_BYTES + 1 })).toContain("10 МБ");
    expect(validateAttachmentFile({ name: "malware.exe", type: "application/octet-stream", size: 1024 })).toContain("Разрешены");
  });

  it("rejects path-like file names", () => {
    expect(validateAttachmentFile({ name: "folder/scan.pdf", type: "application/pdf", size: 1024 })).toContain("Название");
  });
});

describe("hasAllowedAttachmentSignature", () => {
  it("recognizes PDF and JPEG headers", () => {
    expect(hasAllowedAttachmentSignature("application/pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(true);
    expect(hasAllowedAttachmentSignature("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
  });

  it("rejects content that does not match the claimed MIME type", () => {
    expect(hasAllowedAttachmentSignature("application/pdf", new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBe(false);
  });
});
