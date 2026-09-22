import { describe, expect, it } from "vitest";
import { stripJpegExif, stripPngMetadata } from "./strip-exif";

describe("stripJpegExif", () => {
  it("removes an APP1 Exif segment and keeps everything else", () => {
    const exifPayload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xaa, 0xbb]; // "Exif\0\0" + fake TIFF bytes
    const app1Length = exifPayload.length + 2;
    const jpeg = new Uint8Array([
      0xff,
      0xd8, // SOI
      0xff,
      0xe1,
      (app1Length >> 8) & 0xff,
      app1Length & 0xff,
      ...exifPayload, // APP1 Exif
      0xff,
      0xe0,
      0x00,
      0x04,
      0x4a,
      0x46, // APP0 (unrelated, kept)
      0xff,
      0xda,
      0x00,
      0x00,
      0x11,
      0x22,
      0x33, // SOS + fake scan data
      0xff,
      0xd9, // EOI
    ]);

    const result = stripJpegExif(jpeg);

    expect(Array.from(result)).toEqual([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xda, 0x00, 0x00, 0x11, 0x22, 0x33,
      0xff, 0xd9,
    ]);
  });

  it("returns the input unchanged when it doesn't start with a JPEG SOI marker", () => {
    const notJpeg = new Uint8Array([0x00, 0x01, 0x02]);
    expect(stripJpegExif(notJpeg)).toBe(notJpeg);
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

describe("stripPngMetadata", () => {
  it("removes eXIf and tEXt chunks and keeps IHDR/IDAT/IEND", () => {
    const ihdr = [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0];
    const png = new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...pngChunk("IHDR", ihdr),
      ...pngChunk("eXIf", [0xaa, 0xbb, 0xcc]),
      ...pngChunk("tEXt", [0x41, 0x00, 0x42]),
      ...pngChunk("IDAT", [0x01, 0x02]),
      ...pngChunk("IEND", []),
    ]);

    const expected = new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...pngChunk("IHDR", ihdr),
      ...pngChunk("IDAT", [0x01, 0x02]),
      ...pngChunk("IEND", []),
    ]);

    expect(Array.from(stripPngMetadata(png))).toEqual(Array.from(expected));
  });

  it("returns the input unchanged when it doesn't start with the PNG signature", () => {
    const notPng = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    expect(stripPngMetadata(notPng)).toBe(notPng);
  });
});
