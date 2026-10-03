import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PngHelpNote } from "./PngHelpNote";
import { logoPhotosCoverParts } from "./LogoPhotosCoverSection";

describe("PngHelpNote", () => {
  it("points to Canva's background remover in a new tab", () => {
    const html = renderToStaticMarkup(createElement(PngHelpNote));
    expect(html).toContain("You don&#x27;t have a PNG format?");
    expect(html).toContain('href="https://www.canva.com/features/background-remover/"');
    expect(html).toContain('target="_blank"');
  });
});

describe("logoPhotosCoverParts", () => {
  it("a Photos & events editor gets Gallery and Carousel only", () => {
    expect(logoPhotosCoverParts(false)).toEqual(["gallery", "carousel"]);
  });
  it("owners and full editors get all four, logo first", () => {
    expect(logoPhotosCoverParts(true)).toEqual(["logo", "gallery", "carousel", "cover"]);
  });
});
