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
