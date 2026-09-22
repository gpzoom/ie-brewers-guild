import { describe, expect, it } from "vitest";
import { stripImageMetadata, stripJpegExif, stripPngMetadata } from "./strip-exif";

const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];

/** A length-prefixed JPEG segment: FF <marker> <len hi> <len lo> <payload>. */
function jpegSegment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2;
  return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...payload];
}

/** SOS marker followed by opaque "scan data" -- this parser never looks inside it. */
function sos(scanBytes: number[]): number[] {
  return [0xff, 0xda, ...scanBytes];
}

const EXIF_PAYLOAD = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xaa, 0xbb]; // "Exif\0\0" + fake TIFF bytes
const FAKE_SCAN = [0x00, 0x00, 0x11, 0x22, 0x33];

describe("stripJpegExif", () => {
  it("removes an APP1 Exif segment and keeps everything else", () => {
    const jpegBytes = new Uint8Array([
      ...SOI,
      ...jpegSegment(0xe1, EXIF_PAYLOAD), // APP1 Exif (dropped)
      0xff,
      0xe0,
      0x00,
      0x04,
      0x4a,
      0x46, // APP0 (kept)
      ...sos(FAKE_SCAN),
      ...EOI,
    ]);

    const result = stripJpegExif(jpegBytes);

    expect(Array.from(result)).toEqual([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xda, 0x00, 0x00, 0x11, 0x22, 0x33,
      0xff, 0xd9,
    ]);
  });

  it("throws when the input doesn't start with a JPEG SOI marker", () => {
    const notJpeg = new Uint8Array([0x00, 0x01, 0x02]);
    expect(() => stripJpegExif(notJpeg)).toThrow();
  });

  it("keeps a clean image (no metadata segments) byte-for-byte", () => {
    const bytes = new Uint8Array([
      ...SOI,
      ...jpegSegment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00]), // APP0/JFIF
      ...jpegSegment(0xdb, [0x00, 0x01, 0x02, 0x03]), // DQT
      ...jpegSegment(0xc4, [0x00, 0x01, 0x02]), // DHT
      ...jpegSegment(0xc0, [0x08, 0x00, 0x01, 0x00, 0x01, 0x03]), // SOF0
      ...jpegSegment(0xdd, [0x00, 0x04]), // DRI
      ...sos(FAKE_SCAN),
      ...EOI,
    ]);

    const result = stripJpegExif(bytes);

    expect(Array.from(result)).toEqual(Array.from(bytes));
  });

  it("drops an APP1 segment carrying XMP (no literal 'Exif' signature) -- allowlist, not signature match", () => {
    const xmpPayload = Array.from(
      "http://ns.adobe.com/xap/1.0/\0<x:xmpmeta exif:GPSLatitude=1.23>",
    ).map((c) => c.charCodeAt(0));
    const bytes = new Uint8Array([
      ...SOI,
      ...jpegSegment(0xe1, xmpPayload), // APP1/XMP -- no "Exif\0\0" prefix
      ...sos(FAKE_SCAN),
      ...EOI,
    ]);

    const result = stripJpegExif(bytes);

    expect(Array.from(result)).toEqual([...SOI, ...sos(FAKE_SCAN), ...EOI]);
    // The GPS-bearing text must not survive anywhere in the output.
    const resultText = Array.from(result)
      .map((b) => String.fromCharCode(b))
      .join("");
    expect(resultText).not.toContain("GPSLatitude");
  });

  it("throws (does not silently pass through the original bytes) when a segment is followed by a stray non-marker byte", () => {
    // A valid EXIF segment, then garbage where the next marker should start.
    const bytes = new Uint8Array([...SOI, ...jpegSegment(0xe1, EXIF_PAYLOAD), 0x00, 0x11, 0x22]);

    expect(() => stripJpegExif(bytes)).toThrow();
  });

  it("throws (does not desync past EOF) when an earlier segment has a bogus length, before ever reaching the EXIF segment", () => {
    const bytes = new Uint8Array([
      ...SOI,
      0xff,
      0xe0,
      0x7f,
      0xff, // APP0 claiming a 32765-byte payload
      0x00,
      0x01, // ...but only 2 bytes actually follow
      ...jpegSegment(0xe1, EXIF_PAYLOAD), // would-be EXIF, never legitimately reached
    ]);

    expect(() => stripJpegExif(bytes)).toThrow();
  });

  it("walks past legal 0xFF fill-byte padding before a marker instead of misreading it as one", () => {
    const bytes = new Uint8Array([
      ...SOI,
      0xff,
      0xff,
      0xff,
      0xe0,
      0x00,
      0x04,
      0x4a,
      0x46, // 2 fill bytes + APP0 (kept)
      0xff,
      0xff,
      ...jpegSegment(0xe1, EXIF_PAYLOAD).slice(1), // 1 fill byte + APP1 Exif (dropped)
      ...sos(FAKE_SCAN),
      ...EOI,
    ]);

    const result = stripJpegExif(bytes);

    expect(Array.from(result)).toEqual([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xda, 0x00, 0x00, 0x11, 0x22, 0x33,
      0xff, 0xd9,
    ]);
  });

  it("throws when a complete second JPEG (its own SOI...EOI, with EXIF/GPS) is appended after the primary image's EOI -- e.g. Samsung Motion Photo / Apple Live Photo / MPF", () => {
    const primaryImage = [
      ...SOI,
      ...jpegSegment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00]), // APP0/JFIF
      ...sos(FAKE_SCAN),
      ...EOI,
    ];
    // A complete secondary JPEG, with its own untouched EXIF/GPS, riding
    // along after the primary image's EOI -- exactly what Motion Photo /
    // Live Photo / MPF-tagged files do.
    const secondaryImageWithGps = [
      ...SOI,
      ...jpegSegment(0xe1, EXIF_PAYLOAD),
      ...sos(FAKE_SCAN),
      ...EOI,
    ];
    const bytes = new Uint8Array([...primaryImage, ...secondaryImageWithGps]);

    expect(() => stripJpegExif(bytes)).toThrow();
  });

  it("still passes through a normal single-image JPEG with no trailing data (doesn't over-reject the common case)", () => {
    const bytes = new Uint8Array([
      ...SOI,
      ...jpegSegment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00]), // APP0/JFIF
      ...sos(FAKE_SCAN),
      ...EOI,
    ]);

    const result = stripJpegExif(bytes);

    expect(Array.from(result)).toEqual(Array.from(bytes));
  });
});

function pngChunk(type: string, data: number[]): number[] {
  const length = data.length;
  const typeBytes = Array.from(type).map((c) => c.charCodeAt(0));
  const lengthBytes = [
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
  ];
  return [...lengthBytes, ...typeBytes, ...data, 0, 0, 0, 0]; // CRC unchecked by the stripper, placeholder is fine
}

const IHDR = [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("stripPngMetadata", () => {
  it("removes eXIf and tEXt chunks and keeps IHDR/IDAT/IEND", () => {
    const png = new Uint8Array([
      ...PNG_SIGNATURE,
      ...pngChunk("IHDR", IHDR),
      ...pngChunk("eXIf", [0xaa, 0xbb, 0xcc]),
      ...pngChunk("tEXt", [0x41, 0x00, 0x42]),
      ...pngChunk("IDAT", [0x01, 0x02]),
      ...pngChunk("IEND", []),
    ]);

    const expected = new Uint8Array([
      ...PNG_SIGNATURE,
      ...pngChunk("IHDR", IHDR),
      ...pngChunk("IDAT", [0x01, 0x02]),
      ...pngChunk("IEND", []),
    ]);

    expect(Array.from(stripPngMetadata(png))).toEqual(Array.from(expected));
  });

  it("throws when the input doesn't start with the PNG signature", () => {
    const notPng = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    expect(() => stripPngMetadata(notPng)).toThrow();
  });

  it("keeps a clean image (IHDR/IDAT/IEND only) byte-for-byte", () => {
    const png = new Uint8Array([
      ...PNG_SIGNATURE,
      ...pngChunk("IHDR", IHDR),
      ...pngChunk("IDAT", [0x01, 0x02, 0x03]),
      ...pngChunk("IEND", []),
    ]);

    expect(Array.from(stripPngMetadata(png))).toEqual(Array.from(png));
  });

  it("keeps tRNS (needed for correct rendering of a transparent logo)", () => {
    const png = new Uint8Array([
      ...PNG_SIGNATURE,
      ...pngChunk("IHDR", IHDR),
      ...pngChunk("PLTE", [0, 0, 0, 255, 255, 255]),
      ...pngChunk("tRNS", [0x00, 0xff]),
      ...pngChunk("tEXt", [0x41, 0x00, 0x42]),
      ...pngChunk("IDAT", [0x01, 0x02]),
      ...pngChunk("IEND", []),
    ]);

    const expected = new Uint8Array([
      ...PNG_SIGNATURE,
      ...pngChunk("IHDR", IHDR),
      ...pngChunk("PLTE", [0, 0, 0, 255, 255, 255]),
      ...pngChunk("tRNS", [0x00, 0xff]),
      ...pngChunk("IDAT", [0x01, 0x02]),
      ...pngChunk("IEND", []),
    ]);

    expect(Array.from(stripPngMetadata(png))).toEqual(Array.from(expected));
  });

  it("throws (does not desync past EOF) on a chunk with a bogus length", () => {
    const png = new Uint8Array([
      ...PNG_SIGNATURE,
      ...pngChunk("IHDR", IHDR),
      0x7f,
      0xff,
      0xff,
      0xff, // eXIf claiming a ~2GB payload
      0x65,
      0x58,
      0x49,
      0x66, // "eXIf"
      0xaa,
      0xbb, // ...but the file ends right here
    ]);

    expect(() => stripPngMetadata(png)).toThrow();
  });

  it("throws on a truncated file with no IEND chunk", () => {
    const png = new Uint8Array([
      ...PNG_SIGNATURE,
      ...pngChunk("IHDR", IHDR),
      ...pngChunk("IDAT", [0x01, 0x02]),
    ]);

    expect(() => stripPngMetadata(png)).toThrow();
  });
});

describe("stripImageMetadata", () => {
  it("strips a JPEG regardless of mimeType by sniffing the magic bytes", () => {
    const jpegBytes = new Uint8Array([
      ...SOI,
      ...jpegSegment(0xe1, EXIF_PAYLOAD),
      ...sos(FAKE_SCAN),
      ...EOI,
    ]);

    // mimeType lies (says PNG); the actual bytes are a JPEG and must still be stripped correctly.
    const result = stripImageMetadata(jpegBytes, "image/png");

    expect(Array.from(result)).toEqual([...SOI, ...sos(FAKE_SCAN), ...EOI]);
  });

  it("strips a PNG regardless of mimeType by sniffing the magic bytes", () => {
    const pngBytes = new Uint8Array([
      ...PNG_SIGNATURE,
      ...pngChunk("IHDR", IHDR),
      ...pngChunk("eXIf", [0xaa, 0xbb]),
      ...pngChunk("IDAT", [0x01]),
      ...pngChunk("IEND", []),
    ]);

    // mimeType lies (says JPEG); the actual bytes are a PNG and must still be stripped correctly.
    const result = stripImageMetadata(pngBytes, "image/jpeg");

    expect(Array.from(result)).toEqual([
      ...PNG_SIGNATURE,
      ...pngChunk("IHDR", IHDR),
      ...pngChunk("IDAT", [0x01]),
      ...pngChunk("IEND", []),
    ]);
  });

  it("passes SVG text through unchanged", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(Array.from(stripImageMetadata(svg, "image/svg+xml"))).toEqual(Array.from(svg));
  });

  it("throws (does not pass through unstripped) for an unsupported format such as HEIC", () => {
    // Simplified HEIC/ISOBMFF-style header: ....ftypheic....
    const heicLike = new Uint8Array([
      0x00,
      0x00,
      0x00,
      0x18,
      0x66,
      0x74,
      0x79,
      0x70, // size + "ftyp"
      0x68,
      0x65,
      0x69,
      0x63, // "heic"
      0x00,
      0x00,
      0x00,
      0x00,
    ]);

    expect(() => stripImageMetadata(heicLike, "image/heic")).toThrow();
  });

  it("throws for a mislabeled non-image blob claiming to be a JPEG", () => {
    const notAnImage = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    expect(() => stripImageMetadata(notAnImage, "image/jpeg")).toThrow();
  });
});
