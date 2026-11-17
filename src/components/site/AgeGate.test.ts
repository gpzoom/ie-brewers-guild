import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgeGate } from "@/components/site/AgeGate";

describe("AgeGate", () => {
  it("asks for a date of birth, and links members to sign in plus the policies", () => {
    const html = renderToStaticMarkup(createElement(AgeGate, { onConfirmed: () => {} }));
    expect(html).toContain("You must be 21 or older to visit this site.");
    for (const name of ['name="month"', 'name="day"', 'name="year"']) expect(html).toContain(name);
    expect(html).toContain("Enter the site");
    expect(html).toContain('href="/signin?next=/portal"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });
});
