import { describe, expect, it } from "vitest";
import { isHttpUrl, validateLinkUrl } from "./url-safety";

describe("isHttpUrl", () => {
  it("accepts a real http URL", () => {
    expect(isHttpUrl("http://example.com/menu")).toBe(true);
  });

  it("accepts a real https URL", () => {
    expect(isHttpUrl("https://example.com/menu")).toBe(true);
  });

  // The concrete stored-XSS test case: a member_links.url value of
  // `javascript:alert(document.cookie)` is exactly what an attacker (or a
  // member misled into pasting a bookmarklet) would put in this field --
  // LinkPills.tsx used to render it straight into a real <a href>, so any
  // visitor who clicked the pill would execute this in the site's own
  // origin.
  it("rejects a javascript: URL -- the stored-XSS vector this function exists to stop", () => {
    expect(isHttpUrl("javascript:alert(document.cookie)")).toBe(false);
  });

  it("rejects a data: URL", () => {
    expect(isHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rejects a file:// URL", () => {
    expect(isHttpUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects a vbscript: URL", () => {
    expect(isHttpUrl("vbscript:msgbox(1)")).toBe(false);
  });

  it("rejects a string that doesn't parse as a URL at all", () => {
    expect(isHttpUrl("not a url")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isHttpUrl("")).toBe(false);
  });
});

describe("validateLinkUrl", () => {
  it("accepts a real https URL", () => {
    expect(validateLinkUrl("https://example.com")).toEqual({ valid: true });
  });

  it("rejects a javascript: URL with a clear, member-facing reason", () => {
    const result = validateLinkUrl("javascript:alert(document.cookie)");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/http/i);
    }
  });

  it("rejects a string that doesn't parse as a URL at all", () => {
    const result = validateLinkUrl("not a url");
    expect(result.valid).toBe(false);
  });
});

/**
 * Second write path reusing these exact same functions:
 * carousel_slides.outbound_url (src/lib/media/carousel.server.ts's
 * updateCarouselSlideLink for the write boundary,
 * src/components/profile/MediaCarousel.tsx for the render boundary) has
 * the identical shape as member_links.url -- a bare `text` column with no
 * DB-level scheme constraint, wrapped unsanitized in a public `<a href>`.
 * Neither file defines its own validation logic; both import isHttpUrl/
 * validateLinkUrl straight from here, so these adversarial cases cover
 * that second path's actual runtime behavior too, not just member_links'.
 * A handful of obfuscation variants beyond the plain payload above, since
 * a real attacker (or the reviewer's own adversarial pass) wouldn't stop
 * at the literal string.
 */
describe("isHttpUrl / validateLinkUrl -- adversarial coverage shared with carousel_slides.outbound_url", () => {
  it("rejects a javascript: URL regardless of case (JavaScript:, JAVASCRIPT:)", () => {
    expect(isHttpUrl("JavaScript:alert(document.cookie)")).toBe(false);
    expect(isHttpUrl("JAVASCRIPT:alert(document.cookie)")).toBe(false);
  });

  it("rejects a javascript: URL with embedded control characters attempting scheme-smuggling", () => {
    // Tab/newline inside the scheme name -- some legacy HTML parsers strip
    // these before treating a value as a URL, so a naive string-prefix
    // check (e.g. `!url.startsWith("javascript:")`) could be bypassed this
    // way. WHATWG URL parsing strips ASCII tab/newline everywhere in the
    // input before tokenizing, so `new URL(...)` still resolves this to a
    // `javascript:` scheme and isHttpUrl still rejects it.
    expect(isHttpUrl("java\tscript:alert(document.cookie)")).toBe(false);
    expect(isHttpUrl("java\nscript:alert(document.cookie)")).toBe(false);
  });

  it("rejects a percent-encoded javascript: scheme", () => {
    // `javascript%3Aalert(1)` doesn't parse as an absolute URL at all (no
    // real scheme token before decoding), so this hits the catch branch
    // and returns false -- not decoded-then-checked, just rejected either
    // way.
    expect(isHttpUrl("javascript%3Aalert(1)")).toBe(false);
  });

  it("rejects a data: URL carrying an inline <script> payload", () => {
    expect(isHttpUrl("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")).toBe(false);
  });

  it("still accepts the legitimate http(s) URLs both member_links.url and carousel_slides.outbound_url actually need", () => {
    expect(isHttpUrl("https://untappd.com/venue/12345")).toBe(true);
    expect(isHttpUrl("http://example-brewery.com/order")).toBe(true);
  });

  it("validateLinkUrl rejects the same case/control-character javascript: variants with a clear reason", () => {
    for (const payload of ["JavaScript:alert(1)", "java\tscript:alert(1)"]) {
      const result = validateLinkUrl(payload);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toMatch(/http/i);
      }
    }
  });
});
