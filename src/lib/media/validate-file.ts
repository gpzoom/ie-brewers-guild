import { fileTypeFromBuffer } from "file-type";

export type FileValidationResult =
  | { valid: true; detectedMimeType: string }
  | { valid: false; reason: string };

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB cap (spec: "cap file size").

/**
 * Which raster formats validate as "real" for this call, keyed by context.
 *
 * allowSvg doubles as the "is this the logo upload path" flag -- across
 * this module's three real call sites (this plan's Task 14/17/20),
 * allowSvg is only ever true for the logo upload and false for the general
 * photo paths (media gallery, creator upload). Spec, "Logos and assets":
 * "PNG or SVG only, transparent background, minimum 400px tall. Reject
 * JPGs at upload with a message that says why, rather than accepting and
 * looking bad. Validate the actual file signature, not the extension."
 *
 * So a genuine JPEG (verified by its real magic bytes, not by what it
 * claims to be) must be REJECTED when allowSvg is true, and accepted when
 * it's false. Getting this backwards -- accepting any JPEG signature
 * unconditionally regardless of context -- would silently defeat the
 * logo path's whole reason for existing: Task 17's planned handler
 * (`logo.server.ts`) greps this function's rejection `reason` for the
 * substring "PNG or SVG" to decide whether to show its friendly
 * "Logos must be PNG or SVG" message, so a real JPEG has to actually
 * produce that rejection, not a `valid: true` result.
 */
function allowedRasterMimeTypes(allowSvg: boolean): ReadonlySet<string> {
  return allowSvg ? new Set(["image/png"]) : new Set(["image/jpeg", "image/png"]);
}

/**
 * SVG has no fixed magic-byte signature (it's XML text) -- file-type cannot
 * detect it, so content-sniff instead.
 */
function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, 2048))
    .replace(/^\uFEFF/, "")
    .trim();
  return /^(<\?xml[^>]*\?>\s*)?(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head);
}

/**
 * Cheap defense-in-depth for SVG's real attack surface, not the full
 * sanitization Phase 3 already deferred for inline rendering -- SVGs
 * validated here are still only ever served via <img src>, never inlined
 * into the page (this plan's Decision 10). A literal <script> tag is only
 * one of several ways to get executable content out of an SVG; this also
 * catches inline event-handler attributes (onload=, onerror=, onclick=,
 * ...), javascript: URIs, <foreignObject>/<iframe> (which can smuggle
 * arbitrary HTML/script), and DTD entity declarations (XXE / entity
 * expansion). This is still a denylist over raw text, not a real XML
 * parser or sanitizer -- a determined adversary using encoding tricks
 * (HTML-entity-encoded attribute values, mixed case beyond what the /i
 * flag covers, CDATA games, etc.) could still get past a regex check like
 * this one. The residual risk this does NOT close: if any future code path
 * ever serves one of these files in a context where a browser parses it as
 * a *document* rather than a static <img> (a "view original" link, direct
 * navigation to the storage URL, use as an og:image, etc.), embedded
 * script still runs regardless of what this function rejects -- that's an
 * assumption about how Tasks 14/17/20 serve the file, which this module
 * cannot enforce or verify. Flagged forward for whoever wires up serving.
 */
const DANGEROUS_SVG_PATTERNS: RegExp[] = [
  /<script[\s>]/i,
  /<foreignobject[\s>]/i,
  /<iframe[\s>]/i,
  /\son\w+\s*=/i, // event-handler attributes: onload=, onerror=, onclick=, ...
  /javascript:/i,
  /<!entity/i, // DTD entity declaration (XXE / billion-laughs vector)
];

function containsDangerousSvgContent(bytes: Uint8Array): boolean {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return DANGEROUS_SVG_PATTERNS.some((pattern) => pattern.test(text));
}

export async function validateUploadedImage(params: {
  bytes: Uint8Array;
  claimedMimeType: string;
  allowSvg: boolean;
  maxBytes?: number;
}): Promise<FileValidationResult> {
  const { bytes, allowSvg, maxBytes = MAX_UPLOAD_BYTES } = params;

  if (bytes.byteLength === 0) {
    return { valid: false, reason: "The file is empty." };
  }
  if (bytes.byteLength > maxBytes) {
    return {
      valid: false,
      reason: `The file is larger than the ${Math.round(maxBytes / (1024 * 1024))}MB limit.`,
    };
  }

  const detected = await fileTypeFromBuffer(bytes);

  if (detected && allowedRasterMimeTypes(allowSvg).has(detected.mime)) {
    return { valid: true, detectedMimeType: detected.mime };
  }

  // file-type (v22) does not leave `detected` undefined for every SVG: an
  // SVG that opens with an `<?xml ...?>` prologue gets sniffed as generic
  // `application/xml`, not left undetected the way a bare `<svg ...>` is.
  // Gating this branch on strict `!detected` (as a literal reading of this
  // module's algorithm would) rejects that -- very common, since most real
  // authoring tools (Illustrator, Inkscape, Figma exports) emit the XML
  // prologue -- as "not a real PNG or SVG file". So: treat "nothing
  // detected" and "detected as generic XML" as equally eligible for SVG
  // content-sniffing; any *other* detected type (a real raster/binary
  // signature) still blocks it, since binary magic bytes can't also decode
  // as text starting with `<svg` or `<?xml`.
  const isXmlLike =
    !detected || detected.mime === "application/xml" || detected.mime === "text/xml";

  if (allowSvg && isXmlLike && looksLikeSvg(bytes)) {
    if (containsDangerousSvgContent(bytes)) {
      return {
        valid: false,
        reason: "This SVG contains scripting or active content, which isn't allowed.",
      };
    }
    return { valid: true, detectedMimeType: "image/svg+xml" };
  }

  return {
    valid: false,
    reason: allowSvg
      ? "This doesn't look like a real PNG or SVG file. Only PNG or SVG logos are accepted."
      : "This doesn't look like a real image file (its content doesn't match its extension).",
  };
}

/** PNG IHDR is always the first chunk: 8-byte signature + 4-byte length + 4-byte type + width(4) + height(4). */
export function readPngHeight(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 26) return null;
  const isPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b);
  if (!isPng) return null;
  return ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
}
