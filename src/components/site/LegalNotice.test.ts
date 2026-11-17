import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LegalNotice } from "@/components/site/LegalNotice";
import { LEGAL } from "@/lib/site/legal";

describe("LegalNotice", () => {
  it("beside Publish: the exact line, with links to Terms and Privacy that open in a new tab", () => {
    const html = renderToStaticMarkup(createElement(LegalNotice, { action: "publishing" }));
    expect(html.replace(/<[^>]+>/g, "")).toBe("By publishing, you agree to the Terms and Privacy Policy.");
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html.match(/target="_blank"/g)).toHaveLength(2);
  });

  it("beside Join's Submit: says submitting", () => {
    const html = renderToStaticMarkup(createElement(LegalNotice, { action: "submitting" }));
    expect(html.replace(/<[^>]+>/g, "")).toBe("By submitting, you agree to the Terms and Privacy Policy.");
  });
});

describe("LEGAL", () => {
  it("holds the owner's facts", () => {
    expect(LEGAL.name).toBe("Inland Southern California Brewers Guild");
    expect(LEGAL.email).toBe("legal@iscbrewersguild.org");
    expect(LEGAL.county).toBe("San Bernardino County");
    expect(LEGAL.entity).toContain("501(c)(6)");
  });
});
