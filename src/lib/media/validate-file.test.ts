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

  // --- Fix round: reviewer-confirmed bypasses of the SVG denylist above, plus
  // two false-positive/dead-code fixes. Each test below fails against the
  // pre-fix denylist (namespace-agnostic element matching, entity decoding,
  // SMIL attributeName targeting, and href scheme allowlisting were all
  // absent) and passes against the fix.

  describe("SVG denylist bypasses (fix round)", () => {
    it("rejects a <script> element hidden behind a non-default namespace prefix bound to the SVG namespace", async () => {
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg"><s:script>alert(1)</s:script></svg>',
      );
      const result = await validateUploadedImage({
        bytes: svg,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects a <foreignObject> element hidden behind a non-default namespace prefix", async () => {
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:x="http://www.w3.org/2000/svg"><x:foreignObject><body xmlns="http://www.w3.org/1999/xhtml">hi</body></x:foreignObject></svg>',
      );
      const result = await validateUploadedImage({
        bytes: svg,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects a javascript: URI hidden behind numeric character-reference encoding in xlink:href", async () => {
      // &#106; is 'j' -- decodes to "javascript:alert(1)" before the pattern runs.
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="&#106;avascript:alert(1)"><text>click</text></a></svg>',
      );
      const result = await validateUploadedImage({
        bytes: svg,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects a javascript: URI hidden behind an encoded colon in href", async () => {
      // &#58; is ':' -- decodes to "javascript:alert(1)" before the pattern runs.
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript&#58;alert(1)"><text>click</text></a></svg>',
      );
      const result = await validateUploadedImage({
        bytes: svg,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects a SMIL <set> that targets an event-handler attribute via attributeName, not literal on*= text", async () => {
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect><set attributeName="onload" to="alert(1)"/></rect></svg>',
      );
      const result = await validateUploadedImage({
        bytes: svg,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("SVG false-positive fixes (fix round)", () => {
    it("accepts a real Illustrator/Inkscape-shaped export with a generator comment between the XML prologue and the root element", async () => {
      const svg = new TextEncoder().encode(
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
          "<!-- Generator: Adobe Illustrator 24.0.0, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->\n" +
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
      );
      const result = await validateUploadedImage({
        bytes: svg,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      expect(result).toEqual({ valid: true, detectedMimeType: "image/svg+xml" });
    });

    it("accepts an SVG whose <title> merely contains the word 'javascript:' as ordinary prose (not an href value)", async () => {
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"><title>Careful with javascript: in URLs</title><rect width="1" height="1"/></svg>',
      );
      const result = await validateUploadedImage({
        bytes: svg,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      expect(result).toEqual({ valid: true, detectedMimeType: "image/svg+xml" });
    });

    it("accepts a DOCTYPE with an internal subset that declares no ENTITY (proves the sniffer tolerates the syntax, not just rejects it wholesale)", async () => {
      const svg = new TextEncoder().encode(
        '<?xml version="1.0"?><!DOCTYPE svg [<!ELEMENT svg ANY>]><svg xmlns="http://www.w3.org/2000/svg"></svg>',
      );
      const result = await validateUploadedImage({
        bytes: svg,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      expect(result).toEqual({ valid: true, detectedMimeType: "image/svg+xml" });
    });
  });

  // --- Fix round 2: reviewer-confirmed regressions in the fix-round-1 code
  // (a ReDoS in the comment-tolerance regex, an unhandled RangeError in the
  // entity decoder) plus one more real bypass (SMIL indirectly targeting
  // href/xlink:href) left open after round 1.

  describe("SVG comment-tolerance ReDoS (fix round 2)", () => {
    it("does not hang on a long run of empty comments that never resolves to a real <svg> root -- linear time, not exponential", async () => {
      // The pre-fix-round-2 code used one interleaved
      // `(?:\s|<!--...-->)*` regex repeated across several optional
      // sections; when the overall match failed, the engine could
      // partition a run of comments exponentially many ways before giving
      // up. Review measured ~186 bytes of this already taking 357ms and
      // roughly doubling per added comment unit. This payload is bigger
      // (700 bytes) and deliberately never reaches a real `<svg>` tag, so
      // the old code would have to exhaust the full ambiguous search
      // before failing -- the worst case for that pattern.
      const payload = new TextEncoder().encode("<!---->".repeat(100));
      const start = performance.now();
      const result = await validateUploadedImage({
        bytes: payload,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      const elapsedMs = performance.now() - start;
      expect(result.valid).toBe(false);
      // Generous bound (the manual scanner should be sub-millisecond) --
      // this is here to catch a reintroduced exponential-time regex, not
      // to pin an exact number. The pre-fix code measurably took hundreds
      // of milliseconds on a payload a quarter this size.
      expect(elapsedMs).toBeLessThan(50);
    });

    it("still accepts a real Illustrator/Inkscape-shaped export with a generator comment (manual scanner didn't regress the round-1 fix)", async () => {
      const svg = new TextEncoder().encode(
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
          "<!-- Generator: Adobe Illustrator 24.0.0, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->\n" +
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
      );
      const result = await validateUploadedImage({
        bytes: svg,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      expect(result).toEqual({ valid: true, detectedMimeType: "image/svg+xml" });
    });
  });

  describe("entity-decoding RangeError (fix round 2)", () => {
    it("does not throw for an out-of-range decimal character reference -- rejects cleanly instead", async () => {
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="&#99999999;"><text>click</text></a></svg>',
      );
      await expect(
        validateUploadedImage({ bytes: svg, claimedMimeType: "image/svg+xml", allowSvg: true }),
      ).resolves.toMatchObject({ valid: false });
    });

    it("does not throw for an out-of-range hex character reference -- rejects cleanly instead", async () => {
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="&#x7FFFFFFF;"><text>click</text></a></svg>',
      );
      await expect(
        validateUploadedImage({ bytes: svg, claimedMimeType: "image/svg+xml", allowSvg: true }),
      ).resolves.toMatchObject({ valid: false });
    });
  });

  describe("SMIL indirect href/xlink:href targeting (fix round 2)", () => {
    it('rejects <animate attributeName="xlink:href" values="javascript:..."> -- the exact bypass payload from review', async () => {
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
          '<a><animate attributeName="xlink:href" values="javascript:alert(1)" begin="0s" dur="1s" repeatCount="indefinite"/><text x="10" y="20">click me</text></a>' +
          "</svg>",
      );
      const result = await validateUploadedImage({
        bytes: svg,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      expect(result.valid).toBe(false);
    });

    it('rejects the same bypass using attributeName="href" (no xlink prefix) and to= instead of values=', async () => {
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"><a><set attributeName="href" to="javascript:alert(1)"/><text>click</text></a></svg>',
      );
      const result = await validateUploadedImage({
        bytes: svg,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      expect(result.valid).toBe(false);
    });

    it("still accepts <animate> targeting a harmless attribute (proves the fix doesn't blanket-reject SMIL animation)", async () => {
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"><animate attributeName="opacity" values="0;1" dur="1s"/></rect></svg>',
      );
      const result = await validateUploadedImage({
        bytes: svg,
        claimedMimeType: "image/svg+xml",
        allowSvg: true,
      });
      expect(result).toEqual({ valid: true, detectedMimeType: "image/svg+xml" });
    });

    it('still accepts <set attributeName="href" to="#fragment"> targeting a safe same-document fragment', async () => {
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"><a><set attributeName="href" to="#target"/><text>click</text></a></svg>',
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
