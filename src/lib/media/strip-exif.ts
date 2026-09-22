/**
 * Hand-written, dependency-free EXIF/metadata stripping (spec, "Logos and
 * assets": "Strip EXIF from uploaded photos. Phone photos carry GPS
 * coordinates..."). Byte-level JPEG marker / PNG chunk parsing needs
 * nothing but Uint8Array, which behaves identically in the Cloudflare
 * Workers runtime, Node, and the browser -- unlike an image-processing
 * library, whose Workers compatibility would need to be individually
 * verified (this plan's Decision 9).
 */

export function stripJpegExif(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return bytes; // Not a JPEG (missing SOI) -- caller already validated the signature before calling this.
  }

  const chunks: Uint8Array[] = [bytes.subarray(0, 2)]; // SOI
  let offset = 2;

  while (offset < bytes.length - 1) {
    if (bytes[offset] !== 0xff) {
      return bytes; // Not aligned on a marker -- bail out rather than risk corrupting the file.
    }
    const marker = bytes[offset + 1];

    if (marker === 0xd9) {
      chunks.push(bytes.subarray(offset, offset + 2)); // EOI
      offset += 2;
      break;
    }

    if (marker === 0xda) {
      chunks.push(bytes.subarray(offset)); // SOS -- scan data through EOI, copied through untouched.
      offset = bytes.length;
      break;
    }

    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      chunks.push(bytes.subarray(offset, offset + 2)); // RSTn / TEM: no length field.
      offset += 2;
      continue;
    }

    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const segmentEnd = offset + 2 + length;

    const isApp1Exif =
      marker === 0xe1 &&
      length >= 8 &&
      bytes[offset + 4] === 0x45 && // 'E'
      bytes[offset + 5] === 0x78 && // 'x'
      bytes[offset + 6] === 0x69 && // 'i'
      bytes[offset + 7] === 0x66; // 'f'

    if (!isApp1Exif) {
      chunks.push(bytes.subarray(offset, segmentEnd));
    }
    offset = segmentEnd;
  }

  return concatUint8Arrays(chunks);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_STRIPPED_CHUNK_TYPES = new Set(["eXIf", "tEXt", "zTXt", "iTXt"]);

export function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 8 || !PNG_SIGNATURE.every((b, i) => bytes[i] === b)) {
    return bytes;
  }

  const chunks: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;

  while (offset + 8 <= bytes.length) {
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
    const chunkEnd = offset + 8 + length + 4; // + 4-byte CRC

    if (!PNG_STRIPPED_CHUNK_TYPES.has(type)) {
      chunks.push(bytes.subarray(offset, chunkEnd));
    }

    offset = chunkEnd;
    if (type === "IEND") break;
  }

  return concatUint8Arrays(chunks);
}

export function stripImageMetadata(bytes: Uint8Array, mimeType: string): Uint8Array {
  if (mimeType === "image/jpeg") return stripJpegExif(bytes);
  if (mimeType === "image/png") return stripPngMetadata(bytes);
  return bytes; // SVG carries no binary EXIF; video is out of scope for this phase's metadata concern.
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
