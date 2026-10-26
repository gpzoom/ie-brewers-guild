/**
 * Before a photo is uploaded, the browser redraws it as a clean file
 * (owner, 2026-10-05): a WebP or HEIC saved with a .jpg name, a phone's
 * "motion photo" (a JPEG with a second image appended), or a JPEG with
 * extra bytes after its end all used to be refused by the server with
 * "this format isn't supported". Redrawn, they're a plain JPEG -- and the
 * photo's location and camera data are gone too. PNGs stay PNG so a
 * transparent background survives. If the browser can't read the file,
 * the original goes up unchanged and the server's checks decide.
 */
export const MAX_PHOTO_EDGE = 4096;
const JPEG_QUALITY = 0.9;

export function normalizedTarget(file: { type: string; name: string }): { mime: "image/jpeg" | "image/png"; name: string } {
  if (file.type === "image/png") return { mime: "image/png", name: file.name };
  const base = file.name.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "photo";
  return { mime: "image/jpeg", name: `${base}.jpg` };
}

export function fitWithin(width: number, height: number, max = MAX_PHOTO_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export type NormalizeDeps = {
  /** Read the image, upright (EXIF orientation applied). Throws if the browser can't. */
  decode: (file: File) => Promise<{ width: number; height: number; source: unknown }>;
  /** Draw it at width x height and encode; null if the browser can't. */
  encode: (source: unknown, width: number, height: number, mime: "image/jpeg" | "image/png") => Promise<Blob | null>;
};

export async function normalizePhotoForUpload(file: File, deps: NormalizeDeps = browserDeps()): Promise<File> {
  try {
    const target = normalizedTarget(file);
    const decoded = await deps.decode(file);
    const size = fitWithin(decoded.width, decoded.height);
    const blob = await deps.encode(decoded.source, size.width, size.height, target.mime);
    if (!blob || blob.size === 0) return file;
    return new File([blob], target.name, { type: target.mime, lastModified: file.lastModified });
  } catch {
    return file;
  }
}

function browserDeps(): NormalizeDeps {
  return {
    async decode(file) {
      if (typeof createImageBitmap === "function") {
        try {
          const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
          return { width: bitmap.width, height: bitmap.height, source: bitmap };
        } catch {
          // Fall through to <img>, which can read some formats createImageBitmap can't (HEIC in Safari).
        }
      }
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        img.decoding = "async";
        img.src = url;
        await img.decode();
        return { width: img.naturalWidth, height: img.naturalHeight, source: img };
      } finally {
        // The image keeps its decoded pixels; the URL isn't needed after decode.
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    },
    async encode(source, width, height, mime) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      if (mime === "image/jpeg") {
        // JPEG has no transparency: a see-through WebP gets white, not black.
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
      return new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, JPEG_QUALITY));
    },
  };
}
