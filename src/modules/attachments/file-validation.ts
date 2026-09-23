export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/tiff",
  "application/pdf",
] as const;

const extensionByMimeType: Record<(typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/tiff": "tiff",
  "application/pdf": "pdf",
};

type AttachmentFileMetadata = {
  name: string;
  type: string;
  size: number;
};

export function validateAttachmentFile(file: AttachmentFileMetadata): string | null {
  if (file.size <= 0) return "Выберите непустой файл.";
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) return "Размер файла не должен превышать 10 МБ.";
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.type as (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number])) {
    return "Разрешены изображения JPEG, PNG, WebP, HEIC, TIFF и PDF.";
  }
  const normalizedName = file.name.trim();
  if (!normalizedName || normalizedName.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(normalizedName)) {
    return "Название файла некорректно или слишком длинное.";
  }
  return null;
}

export function attachmentExtension(mimeType: string) {
  return extensionByMimeType[mimeType as keyof typeof extensionByMimeType] ?? "bin";
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

export function hasAllowedAttachmentSignature(mimeType: string, bytes: Uint8Array) {
  if (mimeType === "application/pdf") {
    return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  }
  if (mimeType === "image/jpeg") {
    return startsWith(bytes, [0xff, 0xd8, 0xff]);
  }
  if (mimeType === "image/png") {
    return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (mimeType === "image/webp") {
    return startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
      && bytes[8] === 0x57
      && bytes[9] === 0x45
      && bytes[10] === 0x42
      && bytes[11] === 0x50;
  }
  if (mimeType === "image/tiff") {
    return startsWith(bytes, [0x49, 0x49, 0x2a, 0x00])
      || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a]);
  }
  if (mimeType === "image/heic" || mimeType === "image/heif") {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp"
      && ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand);
  }
  return false;
}
