import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgeGate } from "@/components/site/AgeGate";

describe("AgeGate", () => {
  it("asks the visitor to check a box confirming 21+, with an under-21 way out", () => {
    const html = renderToStaticMarkup(createElement(AgeGate, { onConfirmed: () => {} }));
    expect(html).toContain("You must be 21 or older to visit this site.");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("I am 21 or older");
    expect(html).toContain("Enter the site");
    expect(html).toContain("I&#x27;m under 21");
    expect(html).not.toContain('name="year"');
  });

  it("sits over the page as a dark, see-through layer with the page blurred behind it", () => {
    const html = renderToStaticMarkup(createElement(AgeGate, { onConfirmed: () => {} }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("fixed inset-0");
    expect(html).toContain("bg-black/65");
    expect(html).toContain("backdrop-blur-md");
  });

  it("links members to sign in, plus the policies", () => {
    const html = renderToStaticMarkup(createElement(AgeGate, { onConfirmed: () => {} }));
    expect(html).toContain('href="/signin?next=/portal"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });
});
