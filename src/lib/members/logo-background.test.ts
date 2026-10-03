import { describe, expect, it } from "vitest";
import { getMemberThemeHex } from "@/lib/theme/member-themes";
import { isLogoBackground, logoBackgroundColor } from "./logo-background";

describe("logoBackgroundColor", () => {
  it("is white for 'light'", () => {
    expect(logoBackgroundColor("light", "amber")).toBe("#FFFFFF");
  });

  it("is the site ink for 'dark'", () => {
    expect(logoBackgroundColor("dark", "amber")).toBe("#241F1A");
  });

  it("is the member's own theme color for 'theme'", () => {
    expect(logoBackgroundColor("theme", "teal")).toBe(getMemberThemeHex("teal"));
    expect(logoBackgroundColor("theme", "garnet")).toBe(getMemberThemeHex("garnet"));
  });

  it("falls back to white for a missing or unknown value (the pre-existing look)", () => {
    expect(logoBackgroundColor(null, "amber")).toBe("#FFFFFF");
    expect(logoBackgroundColor(undefined, "amber")).toBe("#FFFFFF");
    expect(logoBackgroundColor("purple", "amber")).toBe("#FFFFFF");
  });
});

describe("isLogoBackground", () => {
  it("accepts exactly the three choices", () => {
    expect(isLogoBackground("light")).toBe(true);
    expect(isLogoBackground("dark")).toBe(true);
    expect(isLogoBackground("theme")).toBe(true);
    expect(isLogoBackground("white")).toBe(false);
    expect(isLogoBackground(null)).toBe(false);
    expect(isLogoBackground(1)).toBe(false);
  });
});
