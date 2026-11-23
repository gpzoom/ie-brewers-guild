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

  it("describes the Inland Scan Pass: what it stores, who sees it, its cookies", () => {
    expect(t).toContain("Inland Scan Pass");
    expect(t).toContain("each visit (which Guild member and when, and the counter plate that recorded it)");
    expect(t).toContain("the staff member sees your first name");
    expect(t).not.toContain("If a staff member turns on your pass for you");
    expect(t).toContain("which Guild member's counter you signed up at");
    expect(t).not.toContain("bar device");
    expect(t).toContain("keeps you signed in to it for about 400 days, renewed each time you use it");
    expect(t).not.toContain("up to 90 days");
  });

  it("covers the Beer Trail Pass and Zeffy", () => {
    expect(t).toContain("Beer Trail Pass");
    expect(t).toContain("we never see your card number");
    expect(t).toContain("which Guild member's counter you bought it from");
    expect(t).toContain("To sell the Beer Trail Pass and to pay Guild members their share of passes sold at their counter.");
    expect(html).toContain('href="https://support.zeffy.com/privacy-policy-6d7zh"');
    expect(t).toContain("remembers your sign-up for up to 2 hours");
  });

  it("member email opt-ins: kept per member, sent through the site, addresses never given out", () => {
    expect(t).toContain("check the box to let a Guild member email you");
    expect(t).toContain("We never give members your email address");
    expect(t).toContain("how many customers agreed to their emails.");
    expect(t).toContain("under a made-up label, not your name or email address");
  });

  it("sign-in works with email links or codes", () => {
    expect(t).toContain("one-time email links or codes");
  });

  it("describes loyalty rewards and counter plates", () => {
    expect(t).toContain("the Guild and member rewards you earn");
    expect(t).toContain("counter plate");
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
    expect(t).toContain("Effective November 17, 2026");
  });

  it("member content: ownership, reuse beyond the website with credit, and the opt-out (decision B)", () => {
    expect(t).toContain("You keep ownership");
    expect(t).toContain("social media");
    expect(t).toContain("newsletters");
    expect(t).toContain("credit");
    expect(t).toContain("opt out");
  });

  it("the Guild monitors member content against the Brewers Association code", () => {
    expect(t).toContain("The Guild monitors member content");
    expect(t).toContain("Brewers Association Advertising and Marketing Code");
  });

  it("photos sent through a sharing link stay on the website only", () => {
    expect(t).toContain("Photos sent to you through a sharing link are shown only on your profile");
  });

  it("sets the Inland Scan Pass rules", () => {
    expect(t).toContain("Inland Scan Pass is free");
    expect(t).toContain("once at each Beer Trail stop that year");
    expect(t).toContain("approved by the Guild");
    expect(t).toContain("21 or older");
    expect(t).toContain("can change or end the program");
  });

  it("sets the Beer Trail Pass rules: one trail year, sold through Zeffy, non-refundable", () => {
    expect(t).toContain("sold through Zeffy for one trail year (January 1 to December 31, Pacific time)");
    expect(t).toContain("Passes are non-refundable.");
    expect(t).toContain("each year's trail is a new pass");
  });

  it("sets the loyalty reward rules", () => {
    expect(t).toContain("loyalty rewards");
    expect(t).toContain("set by the member");
    expect(t).toContain("expire");
    expect(t).toContain("One reward per visit");
    expect(t).toContain("no cash value");
    expect(t).toContain("with the staff QR code or the staff code");
  });

  it("covers the jobs board, as-is information and limits of liability", () => {
    expect(t).toContain("Jobs board");
    expect(t).toContain("as is");
    expect(t).toContain("Limits on our liability");
    expect(html).toContain('href="/privacy"');
  });
});
