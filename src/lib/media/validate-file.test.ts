import { describe, expect, it } from "vitest";
import { readPngHeight, validateUploadedImage } from "./validate-file";

const PNG_1X1 = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  0x00,
  0x00,
  0x00,
  0x0d,
  0x49,
  0x48,
  0x44,
  0x52, // length=13, "IHDR"
  0x00,
  0x00,
  0x00,
  0x01, // width = 1
  0x00,
  0x00,
  0x01,
  0x90, // height = 400
  0x08,
  0x06,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00, // CRC, unchecked
]);

const JPEG_MAGIC = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
]);

// A real, complete, decodable JPEG (SOI, APP0/JFIF, DQT, minimal SOF0, DHT,
// SOS, one scan byte, EOI) -- not just a magic-byte prefix. Needed for the
// "real JPEG rejected for the logo path" tests, since a rejection driven by
// something *other* than a genuine, fully-signature-matched JPEG wouldn't
// actually prove the case the spec cares about.
const REAL_JPEG = new Uint8Array([
  0xff,
  0xd8, // SOI
  0xff,
  0xe0,
  0x00,
  0x10,
  0x4a,
  0x46,
  0x49,
  0x46,
  0x00,
  0x01,
  0x01,
  0x00,
  0x00,
  0x01,
  0x00,
  0x01,
  0x00,
  0x00, // APP0/JFIF
  0xff,
  0xdb,
  0x00,
  0x04,
  0x00,
  0x01, // DQT (minimal, malformed table contents, irrelevant to signature detection)
  0xff,
  0xda,
  0x00,
  0x02, // SOS (no components, irrelevant to signature detection)
  0x00, // one scan byte
  0xff,
  0xd9, // EOI
]);

const GIF_MAGIC = new TextEncoder().encode("GIF89a").slice(0);

describe("validateUploadedImage", () => {
  it("accepts a real PNG by its magic bytes", async () => {
    const result = await validateUploadedImage({
      bytes: PNG_1X1,
      claimedMimeType: "image/png",
      allowSvg: true,
    });
    expect(result).toEqual({ valid: true, detectedMimeType: "image/png" });
  });

  it("rejects a JPEG renamed to claim it's a PNG, by checking the real signature", async () => {
    const result = await validateUploadedImage({
      bytes: JPEG_MAGIC,
      claimedMimeType: "image/png",
      allowSvg: true,
    });
    expect(result.valid).toBe(false);
  });

  it("accepts a real SVG by content-sniffing, since it has no magic-byte signature", async () => {
    const svg = new TextEncoder().encode(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
    );
    const result = await validateUploadedImage({
      bytes: svg,
      claimedMimeType: "image/svg+xml",
      allowSvg: true,
    });
    expect(result).toEqual({ valid: true, detectedMimeType: "image/svg+xml" });
  });

  it("rejects an SVG containing a <script> tag", async () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const result = await validateUploadedImage({
      bytes: svg,
      claimedMimeType: "image/svg+xml",
      allowSvg: true,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects an oversized file", async () => {
    const big = new Uint8Array(10);
    const result = await validateUploadedImage({
      bytes: big,
      claimedMimeType: "image/png",
      allowSvg: true,
      maxBytes: 5,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects SVG when allowSvg is false", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const result = await validateUploadedImage({
      bytes: svg,
      claimedMimeType: "image/svg+xml",
      allowSvg: false,
    });
    expect(result.valid).toBe(false);
  });

  // --- Adversarial / contract coverage added beyond the brief's happy-path list ---
  // (Per the coordinator: Task 11 shipped a fail-open denylist that this repo had to
  // redesign twice under review. Same rigor here: prove the reject-vs-accept boundary
  // by construction, don't just exercise the happy paths.)

  describe("logo context (allowSvg: true) must reject a real JPEG -- spec: PNG or SVG only", () => {
    it("rejects a genuine, fully-formed JPEG even when claimedMimeType correctly says image/jpeg", async () => {
      // This is the exact case docs/member-profiles.md:116 describes: "PNG or SVG only
      // ... Reject JPGs at upload with a message that says why". A real JPEG must be
      // rejected on the logo path regardless of what it honestly claims to be -- the
      // brief's own literal algorithm (RASTER_SIGNATURE_MIME_TYPES = {jpeg, png}
      // unconditionally) would have let this through, silently breaking Task 17's
      // planned reject-JPEG UX and the spec requirement it exists to satisfy.
      const result = await validateUploadedImage({
        bytes: REAL_JPEG,
        claimedMimeType: "image/jpeg",
        allowSvg: true,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects a genuine JPEG mislabeled as image/png too (claimed type never grants an exemption)", async () => {
      const result = await validateUploadedImage({
        bytes: REAL_JPEG,
        claimedMimeType: "image/png",
        allowSvg: true,
      });
      expect(result.valid).toBe(false);
    });

    it("rejection reason mentions PNG or SVG -- logo.server.ts (Task 17) branches its user-facing copy on this exact substring", async () => {
      const result = await validateUploadedImage({
        bytes: REAL_JPEG,
        claimedMimeType: "image/jpeg",
        allowSvg: true,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("PNG or SVG");
      }
    });
  });

  describe("gallery/creator-upload context (allowSvg: false) still accepts real JPEG", () => {
    it("accepts a genuine JPEG when SVG is disallowed (general photo upload, not the logo path)", async () => {
      const result = await validateUploadedImage({
        bytes: REAL_JPEG,
        claimedMimeType: "image/jpeg",
        allowSvg: false,
      });
      expect(result).toEqual({ valid: true, detectedMimeType: "image/jpeg" });
    });
  });

  it("ignores claimedMimeType entirely and trusts only the real bytes -- a real PNG mislabeled as image/jpeg is still accepted as PNG", async () => {
    const result = await validateUploadedImage({
      bytes: PNG_1X1,
      claimedMimeType: "image/jpeg",
      allowSvg: false,
    });
    expect(result).toEqual({ valid: true, detectedMimeType: "image/png" });
  });

  it("rejects a real GIF (correct signature, unsupported format) rather than misreporting it as invalid-PNG", async () => {
    const result = await validateUploadedImage({
      bytes: GIF_MAGIC,
      claimedMimeType: "image/png",
      allowSvg: false,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects an empty file with a clear reason, rather than throwing or misdetecting", async () => {
    const result = await validateUploadedImage({
      bytes: new Uint8Array(0),
      claimedMimeType: "image/png",
      allowSvg: true,
    });
    expect(result).toEqual({ valid: false, reason: expect.stringContaining("empty") });
  });

  describe("SVG XSS vectors beyond a literal <script> tag", () => {
    it("rejects an SVG using an onload= event-handler attribute (no <script> tag needed)", async () => {
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
      );
      const result = await validateUploadedImage({
        bytes: svg,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects an SVG using an onerror= handler on a nested element", async () => {
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="x" onerror="alert(1)"/></svg>',
      );
      const result = await validateUploadedImage({
        bytes: svg,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects an SVG containing a javascript: URI", async () => {
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>click</text></a></svg>',
      );
      const result = await validateUploadedImage({
        bytes: svg,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects an SVG containing a <foreignObject> (can embed arbitrary HTML/scripts)", async () => {
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml">hi</body></foreignObject></svg>',
      );
      const result = await validateUploadedImage({
        bytes: svg,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects an SVG containing an <iframe>", async () => {
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"><iframe src="https://evil.example"></iframe></svg>',
      );
      const result = await validateUploadedImage({
        bytes: svg,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects an SVG declaring an external/internal DTD entity (XXE / entity-expansion vector)", async () => {
      const svg = new TextEncoder().encode(
        '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>',
      );
      const result = await validateUploadedImage({
        bytes: svg,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      expect(result.valid).toBe(false);
    });

    it("still accepts a clean SVG with a legitimate style attribute (proves the denylist isn't so broad it over-rejects)", async () => {
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" style="fill:blue" /></svg>',
      );
      const result = await validateUploadedImage({
        bytes: svg,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      expect(result).toEqual({ valid: true, detectedMimeType: "image/svg+xml" });
    });
  });
});

describe("readPngHeight", () => {
  it("reads the height from IHDR", () => {
    expect(readPngHeight(PNG_1X1)).toBe(400);
  });

  it("returns null for a non-PNG buffer", () => {
    expect(readPngHeight(JPEG_MAGIC)).toBeNull();
  });

  it("returns null for a buffer too short to contain an IHDR chunk", () => {
    expect(
      readPngHeight(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBeNull();
  });

  it("returns null for an empty buffer", () => {
    expect(readPngHeight(new Uint8Array(0))).toBeNull();
  });
});
