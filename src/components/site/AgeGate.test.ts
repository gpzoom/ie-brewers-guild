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

  it("links members to sign in, plus the policies", () => {
    const html = renderToStaticMarkup(createElement(AgeGate, { onConfirmed: () => {} }));
    expect(html).toContain('href="/signin?next=/portal"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });
});
