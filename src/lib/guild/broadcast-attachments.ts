export const BROADCAST_ATTACHMENT_LIMITS = {
  maxFiles: 5,
  maxTotalBytes: 10485760,
  mimeTypes: [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
} as const;

export function checkAttachmentAdd(
  existing: { size_bytes: number }[],
  file: { size: number; type: string },
): { ok: true } | { ok: false; message: string } {
  if (existing.length >= BROADCAST_ATTACHMENT_LIMITS.maxFiles) {
    return { ok: false, message: "Up to 5 files." };
  }
  if (!(BROADCAST_ATTACHMENT_LIMITS.mimeTypes as readonly string[]).includes(file.type)) {
    return { ok: false, message: "That file type can't be attached. Use PDF, an image, Word or Excel." };
  }
  const total = existing.reduce((sum, f) => sum + f.size_bytes, 0) + file.size;
  if (total > BROADCAST_ATTACHMENT_LIMITS.maxTotalBytes) {
    return { ok: false, message: "Attachments can total 10 MB at most." };
  }
  return { ok: true };
}
