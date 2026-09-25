/**
 * Pixel dimensions for media_assets.width/height. Every crop computation
 * (initialCropForAspect on assign, CropEditor's aspect check) depends on
 * knowing the original's real aspect ratio; without it they fall back to
 * the full-image crop {0,0,1,1}, which squeezes e.g. a 3:2 photo into the
 * 5:2 cover frame.
 *
 * Two sources, in priority order:
 *  1. readImageDimensions -- parsed server-side from the exact bytes that
 *     get stored (after strip-exif). This is authoritative: it can't be
 *     spoofed by the caller, and because stripping removes the EXIF
 *     Orientation tag, the stored file is displayed in its raw pixel
 *     orientation -- which is what these header fields describe.
 *  2. parseClaimedDimensions -- the browser-measured width/height the
 *     upload form sends along (measureImageFile). Only used if (1) can't
 *     parse the header, and only when both values are sane positive ints.
 */

export type ImageDimensions = { width: number; height: number };

/** Anything above this is treated as bogus rather than stored. */
const MAX_IMAGE_DIMENSION = 30000;

function isSaneDimension(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= MAX_IMAGE_DIMENSION;
}

function saneOrNull(width: number, height: number): ImageDimensions | null {
  return isSaneDimension(width) && isSaneDimension(height) ? { width, height } : null;
}

function readPngDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.byteLength < 24) return null;
  const isPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b);
  if (!isPng) return null;
  const readU32 = (o: number) =>
    ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  // IHDR is always the first chunk: signature(8) + length(4) + type(4) + width(4) + height(4).
  return saneOrNull(readU32(16), readU32(20));
}

// Start-of-frame markers carrying the frame size (excludes DHT C4, JPG C8, DAC CC).
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function readJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) return null;
    // Any number of 0xFF fill bytes may precede a marker.
    let markerAt = offset + 1;
    while (markerAt < bytes.byteLength && bytes[markerAt] === 0xff) markerAt++;
    if (markerAt >= bytes.byteLength) return null;
    const marker = bytes[markerAt];
    offset = markerAt - 1;
    // Standalone markers (no length field).
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // End of image / start of scan -- SOF always comes before either.
    if (marker === 0xd9 || marker === 0xda) return null;
    if (offset + 4 > bytes.byteLength) return null;
    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (segmentLength < 2) return null;
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (offset + 9 > bytes.byteLength) return null;
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      return saneOrNull(width, height);
    }
    offset += 2 + segmentLength;
  }
  return null;
}

/** Reads width/height from a PNG or JPEG header; null for anything else or a malformed header. */
export function readImageDimensions(bytes: Uint8Array): ImageDimensions | null {
  return readPngDimensions(bytes) ?? readJpegDimensions(bytes);
}

/**
 * Reads the browser-measured "width"/"height" FormData fields. Both must be
 * present and sane positive integers, otherwise both are ignored -- this is
 * caller-controlled input (and on the creator-upload path, anonymous).
 */
export function parseClaimedDimensions(formData: FormData): ImageDimensions | null {
  const raw = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" && /^\d{1,5}$/.test(value.trim()) ? Number(value.trim()) : NaN;
  };
  return saneOrNull(raw("width"), raw("height"));
}

/** Server-side: bytes first, then the claimed values, then nothing. */
export function resolveImageDimensions(
  bytes: Uint8Array,
  formData: FormData,
): ImageDimensions | null {
  return readImageDimensions(bytes) ?? parseClaimedDimensions(formData);
}

/**
 * Browser-only: measures a picked file's natural size before upload, so it
 * can ride along in the upload FormData as a fallback (see this file's doc
 * comment). Resolves null (never rejects) if the browser can't decode it --
 * the server still validates and may still read the header itself.
 */
export function measureImageFile(file: File): Promise<ImageDimensions | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || typeof URL.createObjectURL !== "function") {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (result: ImageDimensions | null) => {
      URL.revokeObjectURL(url);
      resolve(result);
    };
    img.onload = () => done(saneOrNull(img.naturalWidth, img.naturalHeight));
    img.onerror = () => done(null);
    img.src = url;
  });
}

/** Adds measured dimensions (if any) to an upload FormData. */
export async function appendMeasuredDimensions(formData: FormData, file: File): Promise<void> {
  const dims = await measureImageFile(file);
  if (dims) {
    formData.append("width", String(dims.width));
    formData.append("height", String(dims.height));
  }
}
