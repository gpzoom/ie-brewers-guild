/**
 * Hand-written, dependency-free EXIF/metadata stripping (spec, "Logos and
 * assets": "Strip EXIF from uploaded photos. Phone photos carry GPS
 * coordinates..."). Byte-level JPEG marker / PNG chunk parsing needs
 * nothing but Uint8Array, which behaves identically in the Cloudflare
 * Workers runtime, Node, and the browser -- unlike an image-processing
 * library, whose Workers compatibility would need to be individually
 * verified (this plan's Decision 9).
 *
 * DESIGN (allowlist, not denylist -- see task-11-report.md, "fix round"):
 * a first version tried to recognize and drop specific known-bad segments
 * (APP1/Exif by signature, PNG eXIf/tEXt/...) and fell back to returning
 * the ORIGINAL bytes unchanged whenever parsing hit anything it didn't
 * expect. For a privacy control that's exactly backwards: a JPEG with a
 * stray byte, a desynced length, or GPS carried in XMP instead of literal
 * "Exif\0\0" all silently kept their location data. This version instead
 * keeps ONLY the specific segments/chunks that are structurally necessary
 * to reconstruct a valid, renderable image, discards everything else
 * unconditionally (so it doesn't matter whether the metadata calls itself
 * EXIF, XMP, IPTC, or a comment -- it's not on the keep-list, so it's
 * gone), and THROWS rather than returning anything on any byte pattern it
 * can't cleanly account for. Callers MUST treat a thrown error as "reject
 * this upload", never as "fall back to the original bytes".
 */

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

const JPEG_EOI = 0xd9;
const JPEG_SOS = 0xda;

// Markers that carry NO length field and must never appear before the
// first SOS (RSTn/TEM only occur inside entropy-coded scan data, which is
// copied through opaquely once SOS is hit -- see below). Seeing one here
// means the byte stream is desynced, not that we found real content.
const JPEG_UNEXPECTED_BEFORE_SOS = new Set<number>([
  0x00, // stuffed byte -- only legal inside scan data
  0x01, // TEM
  0xd8, // a second SOI
  0xd0,
  0xd1,
  0xd2,
  0xd3,
  0xd4,
  0xd5,
  0xd6,
  0xd7, // RSTn
]);

// The ONLY segments kept: everything structurally required to decode and
// render the image. APP1 (EXIF or XMP), APP2-APP15, COM, and any marker
// this parser doesn't specifically recognize are dropped unconditionally.
const JPEG_KEEP_MARKERS = new Set<number>([
  0xe0, // APP0 / JFIF -- density + optional thumbnail, no location data
  0xdb, // DQT -- quantization table, required to decode
  0xc4, // DHT -- Huffman table, required to decode
  0xdd, // DRI -- restart interval, required if restart markers are used
  // SOF0-SOF3, SOF5-SOF7, SOF9-SOF11, SOF13-SOF15 -- frame header, required.
  // (0xc4 DHT and 0xc8 "JPG" reserved / 0xcc DAC are deliberately excluded:
  // DHT is handled above, and JPG-reserved/arithmetic-coded JPEGs are rare
  // enough in practice that we reject them rather than risk mishandling.)
  0xc0,
  0xc1,
  0xc2,
  0xc3,
  0xc5,
  0xc6,
  0xc7,
  0xc9,
  0xca,
  0xcb,
  0xcd,
  0xce,
  0xcf,
]);

export function stripJpegExif(bytes: Uint8Array): Uint8Array {
  if (!isJpeg(bytes)) {
    throw new Error("stripJpegExif: input is not a JPEG (missing SOI marker)");
  }

  const chunks: Uint8Array[] = [bytes.subarray(0, 2)]; // SOI
  let offset = 2;

  while (true) {
    if (offset >= bytes.length) {
      throw new Error("stripJpegExif: truncated JPEG (ran off the end before EOI)");
    }
    if (bytes[offset] !== 0xff) {
      throw new Error(
        `stripJpegExif: expected a marker at offset ${offset}, found 0x${bytes[offset].toString(16)} -- refusing to guess`,
      );
    }

    // A marker may legally be preceded by any number of 0xFF fill bytes
    // (FF FF FF ... FF xx). Walk past the fill to the real marker code
    // instead of misreading a fill byte as the marker itself.
    let markerOffset = offset;
    while (markerOffset + 1 < bytes.length && bytes[markerOffset + 1] === 0xff) {
      markerOffset += 1;
    }
    if (markerOffset + 1 >= bytes.length) {
      throw new Error(
        "stripJpegExif: truncated JPEG (fill bytes ran off the end before a marker code)",
      );
    }
    const marker = bytes[markerOffset + 1];

    if (marker === JPEG_EOI) {
      chunks.push(bytes.subarray(markerOffset, markerOffset + 2));
      return concatUint8Arrays(chunks);
    }

    if (marker === JPEG_SOS) {
      // Entropy-coded scan data follows, and it can legitimately contain
      // 0xFF bytes (stuffed as FF 00) and restart markers (FFD0-FFD7).
      // None of that can carry APPn/COM metadata -- real-world encoders
      // only ever place metadata in the header, before the first SOS --
      // so it's safe to copy scan data through verbatim rather than
      // re-parsing it marker-by-marker. But NOT everything after SOS is
      // scan data forever: some phones (Samsung Motion Photo, Apple Live
      // Photo, MPF-tagged JPEGs) append a complete second JPEG -- with its
      // own untouched EXIF/GPS -- after the primary image's EOI. Checking
      // only that the file's last 2 bytes are FF D9 doesn't catch this,
      // since the trailing image ends in its own EOI too. So: locate the
      // primary image's terminating EOI explicitly, and reject rather
      // than silently keep anything found after it.
      const eoiOffset = findTerminatingEoi(bytes, markerOffset);
      if (eoiOffset + 2 !== bytes.length) {
        throw new Error(
          `stripJpegExif: data found after the terminating EOI marker (offset ${eoiOffset + 2} of ${bytes.length}) -- refusing to pass through a possible second embedded image (e.g. Live Photo/Motion Photo) with its own EXIF/GPS untouched`,
        );
      }
      chunks.push(bytes.subarray(markerOffset));
      return concatUint8Arrays(chunks);
    }

    if (JPEG_UNEXPECTED_BEFORE_SOS.has(marker)) {
      throw new Error(
        `stripJpegExif: unexpected marker 0x${marker.toString(16)} at offset ${markerOffset} before SOS`,
      );
    }

    if (markerOffset + 3 >= bytes.length) {
      throw new Error(`stripJpegExif: truncated segment header at offset ${markerOffset}`);
    }
    const length = (bytes[markerOffset + 2] << 8) | bytes[markerOffset + 3];
    if (length < 2) {
      throw new Error(`stripJpegExif: invalid segment length ${length} at offset ${markerOffset}`);
    }
    const segmentEnd = markerOffset + 2 + length;
    if (segmentEnd > bytes.length) {
      throw new Error(
        `stripJpegExif: segment at offset ${markerOffset} overruns the end of the file`,
      );
    }

    if (JPEG_KEEP_MARKERS.has(marker)) {
      chunks.push(bytes.subarray(markerOffset, segmentEnd));
    }
    // Anything not in JPEG_KEEP_MARKERS -- APP1 (EXIF or XMP), APP2-APP15,
    // COM, and anything else -- is dropped unconditionally, regardless of
    // its payload's content or signature.

    offset = segmentEnd;
  }
}

/**
 * Scans forward from an SOS marker (at `scanStart`) for the byte stream's
 * terminating EOI, honoring byte-stuffing (FF 00) and restart markers
 * (FFD0-FFD7) inside entropy-coded data, and skipping over any other
 * length-prefixed marker segment encountered along the way (e.g. a
 * progressive JPEG's next DHT/SOS between scans) rather than misreading
 * it as raw data. Returns the offset of the terminating EOI's leading
 * 0xFF byte, or throws if the stream runs out before finding one.
 *
 * This does not itself re-validate every marker's internal structure --
 * SOS's own component-selector header, for instance, is scanned as plain
 * bytes rather than parsed -- so it doesn't guarantee a fully spec-valid
 * bitstream. What it does guarantee is what's needed here: it will not
 * walk past a real terminating EOI without noticing, which is what lets
 * the caller reject any data appended after it.
 */
function findTerminatingEoi(bytes: Uint8Array, scanStart: number): number {
  let i = scanStart + 2; // past the initiating SOS marker's own FF DA bytes

  while (i < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1; // raw entropy-coded byte
      continue;
    }

    const next = bytes[i + 1];
    if (next === undefined) {
      throw new Error("stripJpegExif: truncated scan data (ran off the end before EOI)");
    }
    if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
      i += 2; // byte-stuffed 0xFF, or a restart marker -- both opaque, no length field
      continue;
    }
    if (next === 0xff) {
      i += 1; // fill byte -- re-examine the next pair
      continue;
    }
    if (next === JPEG_EOI) {
      return i;
    }

    // Any other marker mid-scan (e.g. a progressive JPEG's subsequent
    // DHT/DQT/SOS between scans): a standard length-prefixed segment --
    // skip over it and keep scanning for the terminating EOI.
    if (i + 3 >= bytes.length) {
      throw new Error(`stripJpegExif: truncated segment header inside scan data at offset ${i}`);
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) {
      throw new Error(
        `stripJpegExif: invalid segment length ${length} inside scan data at offset ${i}`,
      );
    }
    const segmentEnd = i + 2 + length;
    if (segmentEnd > bytes.length) {
      throw new Error(
        `stripJpegExif: segment inside scan data at offset ${i} overruns the end of the file`,
      );
    }
    i = segmentEnd;
  }

  throw new Error("stripJpegExif: scan data does not end in EOI (truncated or corrupt JPEG)");
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// The ONLY chunks kept: IHDR/IDAT/IEND are mandatory for any PNG; PLTE is
// mandatory for palette images; tRNS carries palette/simple transparency
// (logos routinely rely on it for a transparent background) and is kept
// for correct rendering. Everything else -- eXIf, tEXt/zTXt/iTXt (which
// can carry XMP, and XMP routinely carries GPS), gAMA/cHRM/sRGB/iCCP/
// pHYs/tIME/etc -- is dropped unconditionally.
const PNG_KEEP_CHUNK_TYPES = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS"]);

export function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  if (!isPng(bytes)) {
    throw new Error("stripPngMetadata: input is not a PNG (missing signature)");
  }

  const chunks: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  let sawIend = false;

  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) {
      throw new Error(`stripPngMetadata: truncated chunk header at offset ${offset}`);
    }
    const length =
      ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>>
      0;
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    const chunkEnd = offset + 8 + length + 4; // + 4-byte CRC (not validated -- see note below)

    if (chunkEnd > bytes.length) {
      throw new Error(
        `stripPngMetadata: chunk "${type}" at offset ${offset} overruns the end of the file`,
      );
    }

    if (PNG_KEEP_CHUNK_TYPES.has(type)) {
      chunks.push(bytes.subarray(offset, chunkEnd));
    }

    offset = chunkEnd;
    if (type === "IEND") {
      sawIend = true;
      break;
    }
  }

  if (!sawIend) {
    throw new Error("stripPngMetadata: truncated PNG (no IEND chunk found)");
  }

  return concatUint8Arrays(chunks);
  // Note: this does not verify each chunk's CRC32. That's a data-integrity
  // concern, not a metadata-leak concern -- dropping a chunk only ever
  // depends on its declared length and type, never its content, so a
  // corrupt CRC can't cause metadata to survive. Bounds-checking every
  // declared length against the actual buffer size (above) is what
  // prevents desync/overrun, independent of CRC validity.
}

function looksLikeSvgText(bytes: Uint8Array): boolean {
  let i = 0;
  // Skip a UTF-8 BOM if present.
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    i = 3;
  }
  // Skip leading ASCII whitespace.
  while (
    i < bytes.length &&
    (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)
  ) {
    i += 1;
  }
  return i < bytes.length && bytes[i] === 0x3c; // '<'
}

export function stripImageMetadata(bytes: Uint8Array, mimeType: string): Uint8Array {
  // Format is determined by sniffing the actual leading bytes, never by
  // trusting the caller-supplied mimeType -- a mislabeled or spoofed
  // mimeType must not be able to route real image bytes around the
  // stripper (this is what closed a mimeType-trust hole in the review).
  if (isJpeg(bytes)) return stripJpegExif(bytes);
  if (isPng(bytes)) return stripPngMetadata(bytes);
  if (mimeType === "image/svg+xml" && looksLikeSvgText(bytes)) {
    return bytes; // SVG is XML text; it carries no binary EXIF/XMP GPS payload.
  }
  // HEIC (iPhone's default capture format, which carries full EXIF+GPS),
  // WebP, and anything else this module doesn't explicitly parse: reject
  // rather than silently pass through unstripped bytes.
  throw new Error(
    `stripImageMetadata: unsupported or unrecognized image format (mimeType: ${mimeType}); refusing to pass through unstripped bytes`,
  );
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}
