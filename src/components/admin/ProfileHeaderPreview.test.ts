import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfileHeaderPreview } from "./ProfileHeaderPreview";

const base = {
  businessName: "Sample Brewing Co.",
  place: "Riverside, CA",
  theme: "amber" as const,
  logoUrl: null,
  logoBackground: "light" as const,
  coverAssetId: null,
  firstSlideAssetId: null,
  slideCount: 0,
};

describe("ProfileHeaderPreview", () => {
  it("a brand-new member gets the theme band and a LOGO placeholder, no images", () => {
    const html = renderToStaticMarkup(createElement(ProfileHeaderPreview, base));
    expect(html.toUpperCase()).toContain("#B45309");
    expect(html).toContain("LOGO");
    expect(html).not.toContain("<img");
    expect(html).toContain("Your slides show here");
  });

  it("shows the cover, the logo and slide 1 of N once they exist", () => {
    const html = renderToStaticMarkup(
      createElement(ProfileHeaderPreview, {
        ...base,
        logoUrl: "https://x/logo.png",
        coverAssetId: "c1",
        firstSlideAssetId: "s1",
        slideCount: 3,
      }),
    );
    expect(html).toContain("/api/admin-media/c1");
    expect(html).toContain("/api/admin-media/s1");
    expect(html).toContain("https://x/logo.png");
    expect(html).toContain("Slide 1 of 3");
  });

  it("puts the logo on its chosen background", () => {
    const html = renderToStaticMarkup(createElement(ProfileHeaderPreview, { ...base, logoBackground: "dark" }));
    expect(html.toUpperCase()).toContain("#241F1A");
  });

  it("keeps the name below the cover band (no overlap)", () => {
    const html = renderToStaticMarkup(createElement(ProfileHeaderPreview, base));
    expect(html).not.toMatch(/-mt-/);
  });
});
