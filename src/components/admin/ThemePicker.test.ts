import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemePicker } from "./ThemePicker";

describe("ThemePicker layout", () => {
  const html = renderToStaticMarkup(
    createElement(ThemePicker, {
      memberId: "m",
      currentTheme: "teal",
      businessName: "Sample Brewing Co.",
      city: "Riverside",
      state: "CA",
      tagline: null,
      showHeading: false,
    }),
  );

  // 4 columns only from 28rem: each name then has room ("Garnet", "Indigo"
  // and "Forest" were cut off at 22rem -- final review, 2026-10-02).
  it("the theme grid adapts to its container instead of a fixed 4 columns", () => {
    expect(html).toContain("@container");
    expect(html).toContain("@[28rem]:grid-cols-4");
    expect(html).not.toContain("sm:grid-cols-4");
  });

  it("the preview's name is never pulled up into the cover band", () => {
    expect(html).not.toContain("-mt-6 flex items-end");
    expect(html).toContain("Sample Brewing Co.");
  });
});
