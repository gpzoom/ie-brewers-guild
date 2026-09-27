/**
 * A food vendor's picture from their calendar entry (docs/member-profiles.md,
 * "Events" > "Food calendar"). The calendar gives a link -- usually a Google
 * Drive attachment -- and the sync copies the picture once into the public
 * event-images bucket. These are the pure parts; the fetch and upload live
 * in calendar-connection.server.ts.
 */

export const EVENT_IMAGES_BUCKET = "event-images";
/** Bigger than any thumbnail needs; anything larger is skipped, not stored. */
export const EVENT_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** The Drive file id in a Google Drive link ("open?id=", "/file/d/<id>/", "uc?id="), else null. */
export function driveFileId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)drive\.google\.com$/i.test(parsed.hostname)) return null;
  const fromPath = parsed.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/);
  const id = fromPath?.[1] ?? parsed.searchParams.get("id");
  return id && /^[A-Za-z0-9_-]{10,}$/.test(id) ? id : null;
}

/**
 * What to fetch for a picture link. A Drive file is fetched through Drive's
 * thumbnail address (a small image, not the viewer page); it only works
 * when the file is shared "Anyone with the link". Anything else must be an
 * http(s) link to the image itself. Null for anything else.
 */
export function imageFetchUrl(source: string): string | null {
  const id = driveFileId(source);
  if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w600`;
  try {
    const parsed = new URL(source);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** The file extension for an image content type we keep, or null for anything else. */
export function imageExtension(contentType: string | null): string | null {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return TYPES[type] ?? null;
}

/** Where a picture is stored: the member's folder, named by a hash of its source link. */
export async function imageStoragePath(
  memberId: string,
  source: string,
  extension: string,
): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
  return `${memberId}/${hex}.${extension}`;
}

/**
 * Fills in each row's image_url from its image_path (the event-images
 * bucket is public, so this is just the address -- no request). `publicUrl`
 * is supabase.storage.from(EVENT_IMAGES_BUCKET).getPublicUrl's result.
 */
export function withEventImageUrls<
  T extends { image_path?: string | null; image_url?: string | null },
>(rows: T[], publicUrl: (path: string) => string): T[] {
  return rows.map((row) =>
    row.image_path ? { ...row, image_url: publicUrl(row.image_path) } : row,
  );
}
