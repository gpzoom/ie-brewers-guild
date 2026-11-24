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
    expect(t).toContain("Effective November 24, 2026");
  });

  it("covers what California's CalOPPA asks for", () => {
    expect(t).toContain("What we collect");
    expect(t).toContain("Who we share it with");
    expect(t).toContain("See, correct or delete");
    expect(t).toContain("Do Not Track");
    expect(t).toContain("Changes to this policy");
  });

  it("names the services and links Google's terms and privacy policy", () => {
    for (const name of ["Cloudflare", "Supabase", "Resend", "Google Maps", "Google Fonts", "Livid"]) expect(t).toContain(name);
    expect(html).toContain('href="https://policies.google.com/privacy"');
    expect(html).toContain('href="https://maps.google.com/help/terms_maps/"');
    expect(t).toContain("We don't sell");
  });

  it("follows the Brewers Association digital media guidelines: age cookie, under 21, opt-in", () => {
    expect(t).toContain("we save a cookie so we don't ask again for one year");
    expect(t).toContain("it records only that you confirmed you're 21 or older");
    expect(t).not.toContain("date of birth");
    expect(t).toContain("anyone under 21");
    expect(t).toContain("We never add you to an email list without your OK");
  });

  it("marketplace listings aren't public", () => {
    expect(t).toContain("marketplace listings, including the contact name, email address and phone number");
    expect(t).toContain("Marketplace listings aren't public.");
  });

  it("lists the Help button's form, which also notes the page and browser", () => {
    expect(t).toContain("the Help button");
    expect(t).toContain("which page you were on");
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
    expect(t).toContain("Effective November 24, 2026");
  });

  it("member content: ownership, reuse beyond the website with credit, and the opt-out (decision B)", () => {
    expect(t).toContain("You keep ownership");
    expect(t).toContain("social media");
    expect(t).toContain("newsletters");
    expect(t).toContain("credit");
    expect(t).toContain("opt out");
  });

  it("marketplace: members only, no alcohol, the Guild isn't part of the sale, never featured elsewhere", () => {
    expect(t).toContain("The Guild isn't the buyer, seller or broker");
    expect(t).toContain("Alcohol can't be listed.");
    expect(t).toContain("won't feature marketplace listings outside the marketplace");
  });

  it("the Guild monitors member content against the Brewers Association code", () => {
    expect(t).toContain("The Guild monitors member content");
    expect(t).toContain("Brewers Association Advertising and Marketing Code");
  });

  it("photos sent through a sharing link stay on the website only", () => {
    expect(t).toContain("Photos sent to you through a sharing link are shown only on your profile");
  });

  it("covers the jobs board, as-is information and limits of liability", () => {
    expect(t).toContain("Jobs board");
    expect(t).toContain("as is");
    expect(t).toContain("Limits on our liability");
    expect(html).toContain('href="/privacy"');
  });
});
