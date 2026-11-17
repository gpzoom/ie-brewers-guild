import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrivacyPolicy } from "@/components/site/PrivacyPolicy";
import { TermsOfUse } from "@/components/site/TermsOfUse";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("Privacy Policy", () => {
  const html = renderToStaticMarkup(createElement(PrivacyPolicy));
  const t = text(html);

  it("names the Guild, its contact and the effective date", () => {
    expect(t).toContain("Inland Southern California Brewers Guild");
    expect(t).toContain("501(c)(6)");
    expect(html).toContain("mailto:legal@iscbrewersguild.org");
    expect(t).toContain("Effective November 17, 2026");
  });

  it("covers what California's CalOPPA asks for", () => {
    expect(t).toContain("What we collect");
    expect(t).toContain("Who we share it with");
    expect(t).toContain("See, correct or delete");
    expect(t).toContain("Do Not Track");
    expect(t).toContain("Changes to this policy");
  });

  it("names the services and links Google's terms and privacy policy", () => {
    for (const name of ["Cloudflare", "Supabase", "Resend", "Google Maps"]) expect(t).toContain(name);
    expect(html).toContain('href="https://policies.google.com/privacy"');
    expect(html).toContain('href="https://maps.google.com/help/terms_maps/"');
    expect(t).toContain("We don't sell");
  });
});

describe("Terms of Use", () => {
  const html = renderToStaticMarkup(createElement(TermsOfUse));
  const t = text(html);

  it("names the Guild, 21+, the contact and San Bernardino County", () => {
    expect(t).toContain("Inland Southern California Brewers Guild");
    expect(t).toContain("21");
    expect(html).toContain("mailto:legal@iscbrewersguild.org");
    expect(t).toContain("San Bernardino County");
    expect(t).toContain("Effective November 17, 2026");
  });

  it("member content: ownership, reuse beyond the website with credit, and the opt-out (decision B)", () => {
    expect(t).toContain("You keep ownership");
    expect(t).toContain("social media");
    expect(t).toContain("newsletters");
    expect(t).toContain("credit");
    expect(t).toContain("opt out");
  });

  it("covers the jobs board, as-is information and limits of liability", () => {
    expect(t).toContain("Jobs board");
    expect(t).toContain("as is");
    expect(t).toContain("Limits on our liability");
    expect(html).toContain('href="/privacy"');
  });
});
