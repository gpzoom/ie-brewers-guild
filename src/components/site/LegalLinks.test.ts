import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LegalLinks } from "@/components/site/LegalLinks";

describe("LegalLinks", () => {
  it("links Privacy and Terms for pages without the site footer, in a new tab", () => {
    const html = renderToStaticMarkup(createElement(LegalLinks));
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html.match(/target="_blank"/g)).toHaveLength(2);
    expect(html.replace(/<[^>]+>/g, "")).toContain("Privacy Policy");
  });
});
