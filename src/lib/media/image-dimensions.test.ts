import { describe, expect, it } from "vitest";
import {
  parseClaimedDimensions,
  readImageDimensions,
  resolveImageDimensions,
} from "./image-dimensions";

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function jpegWithSof(width: number, height: number, sofMarker = 0xc0): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8, // SOI
    0xff,
    0xe0,
    0x00,
    0x04,
    0x00,
    0x00, // APP0, length 4 (2 payload bytes)
    0xff,
    0xff, // fill byte before the next marker
    sofMarker,
    0x00,
    0x0b,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
    0x00,
    0x00,
    0x00,
    0xff,
    0xd9,
  ]);
}

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.append(key, value);
  return fd;
}

describe("readImageDimensions", () => {
  it("reads a PNG's IHDR", () => {
    expect(readImageDimensions(pngHeader(1200, 630))).toEqual({ width: 1200, height: 630 });
  });

  it("reads a baseline JPEG's SOF0 after skipping other segments", () => {
    expect(readImageDimensions(jpegWithSof(3000, 2000))).toEqual({ width: 3000, height: 2000 });
  });

  it("reads a progressive JPEG's SOF2", () => {
    expect(readImageDimensions(jpegWithSof(640, 480, 0xc2))).toEqual({ width: 640, height: 480 });
  });

  it("returns null for garbage, truncated, or zero-size input", () => {
    expect(readImageDimensions(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(readImageDimensions(jpegWithSof(3000, 2000).slice(0, 12))).toBeNull();
    expect(readImageDimensions(pngHeader(0, 10))).toBeNull();
  });
});

describe("parseClaimedDimensions", () => {
  it("accepts two sane positive integers", () => {
    expect(parseClaimedDimensions(form({ width: "4032", height: "3024" }))).toEqual({
      width: 4032,
      height: 3024,
    });
  });

  it("ignores missing, partial, non-integer, negative, zero, or huge values", () => {
    expect(parseClaimedDimensions(form({}))).toBeNull();
    expect(parseClaimedDimensions(form({ width: "100" }))).toBeNull();
    expect(parseClaimedDimensions(form({ width: "100.5", height: "100" }))).toBeNull();
    expect(parseClaimedDimensions(form({ width: "-100", height: "100" }))).toBeNull();
    expect(parseClaimedDimensions(form({ width: "0", height: "100" }))).toBeNull();
    expect(parseClaimedDimensions(form({ width: "99999", height: "100" }))).toBeNull();
    expect(parseClaimedDimensions(form({ width: "1e3", height: "100" }))).toBeNull();
  });
});

describe("resolveImageDimensions", () => {
  it("prefers the header over the claimed values", () => {
    expect(resolveImageDimensions(pngHeader(800, 600), form({ width: "1", height: "1" }))).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("falls back to the claimed values when the header can't be read", () => {
    expect(
      resolveImageDimensions(new Uint8Array([0]), form({ width: "800", height: "600" })),
    ).toEqual({
      width: 800,
      height: 600,
    });
  });
});
