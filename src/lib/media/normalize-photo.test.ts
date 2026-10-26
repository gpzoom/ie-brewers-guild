import { describe, expect, it, vi } from "vitest";
import {
  MAX_PHOTO_UPLOAD_BYTES,
  fitWithin,
  normalizePhotoForUpload,
  normalizedTarget,
  type NormalizeDeps,
} from "./normalize-photo";

describe("normalizedTarget", () => {
  it("a PNG stays a PNG (keeps transparency), same name", () => {
    expect(normalizedTarget({ type: "image/png", name: "logo.png" })).toEqual({ mime: "image/png", name: "logo.png" });
  });
  it.each([
    ["image/jpeg", "Mars Brew.jpeg", "Mars Brew.jpg"],
    ["image/webp", "beer.jpg", "beer.jpg"],
    ["image/heic", "IMG_0042.HEIC", "IMG_0042.jpg"],
    ["", "photo", "photo.jpg"],
  ])("%s %s -> JPEG named %s", (type, name, out) => {
    expect(normalizedTarget({ type, name })).toEqual({ mime: "image/jpeg", name: out });
  });
});

describe("fitWithin", () => {
  it("leaves photos up to 4096 px alone", () => {
    expect(fitWithin(1215, 911)).toEqual({ width: 1215, height: 911 });
  });
  it("scales a huge photo down to 4096 on its long side, keeping its shape", () => {
    expect(fitWithin(8000, 6000)).toEqual({ width: 4096, height: 3072 });
  });
});

function fakeDeps(over: Partial<NormalizeDeps> = {}): NormalizeDeps {
  return {
    decode: vi.fn(async () => ({ width: 1215, height: 911, source: {} })),
    encode: vi.fn(async (_src, w, h, mime) => new Blob([`${w}x${h}`], { type: mime })),
    ...over,
  };
}

describe("normalizePhotoForUpload", () => {
  it("redraws a WebP named .jpg as a real JPEG, same size", async () => {
    const deps = fakeDeps();
    const out = await normalizePhotoForUpload(new File(["x"], "beer.jpg", { type: "image/webp" }), deps);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("beer.jpg");
    expect(deps.encode).toHaveBeenCalledWith(expect.anything(), 1215, 911, "image/jpeg", 0.9);
    expect(deps.encode).toHaveBeenCalledTimes(1);
  });

  it("a photo over the size limit is redrawn at lower quality, then smaller, until it fits (owner, 2026-10-26)", async () => {
    // Fake sizes: bytes = width * quality * 1000; the limit is 2,100,000.
    const deps = fakeDeps({
      decode: vi.fn(async () => ({ width: 4000, height: 3000, source: {} })),
      encode: vi.fn(async (_src, w, _h, mime, q) => new Blob([new Uint8Array(Math.round(w * q * 1000))], { type: mime })),
    });
    const out = await normalizePhotoForUpload(new File(["x"], "big.jpg", { type: "image/jpeg" }), deps, 2_100_000);
    expect((deps.encode as ReturnType<typeof vi.fn>).mock.calls.map((c) => [c[1], c[4]])).toEqual([
      [4000, 0.9],
      [4000, 0.82],
      [3200, 0.82],
      [2560, 0.8],
    ]);
    expect(out.size).toBe(2_048_000);
  });

  it("a PNG only gets fewer pixels, skipping quality-only steps", async () => {
    const deps = fakeDeps({
      decode: vi.fn(async () => ({ width: 4000, height: 3000, source: {} })),
      encode: vi.fn(async (_src, w, _h, mime) => new Blob([new Uint8Array(w * 1000)], { type: mime })),
    });
    const out = await normalizePhotoForUpload(new File(["x"], "shot.png", { type: "image/png" }), deps, 3_000_000);
    expect((deps.encode as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1])).toEqual([4000, 3200, 2560]);
    expect(out.type).toBe("image/png");
  });

  it("the limit is 5 MB", () => {
    expect(MAX_PHOTO_UPLOAD_BYTES).toBe(5 * 1024 * 1024);
  });

  it("a file the browser can't read goes up unchanged (the server decides)", async () => {
    const original = new File(["x"], "odd.heic", { type: "image/heic" });
    const out = await normalizePhotoForUpload(original, fakeDeps({ decode: vi.fn(async () => { throw new Error("no decoder"); }) }));
    expect(out).toBe(original);
  });

  it("an encode failure also falls back to the original", async () => {
    const original = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const out = await normalizePhotoForUpload(original, fakeDeps({ encode: vi.fn(async () => null) }));
    expect(out).toBe(original);
  });
});
