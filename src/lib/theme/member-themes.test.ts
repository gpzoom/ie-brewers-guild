import { describe, expect, it } from "vitest";
import { DEFAULT_MEMBER_THEME, getMemberThemeHex, MEMBER_THEMES } from "./member-themes";

describe("MEMBER_THEMES", () => {
  it("has exactly the 8 themes from the spec, in order", () => {
    expect(MEMBER_THEMES.map((t) => t.name)).toEqual([
      "amber",
      "rust",
      "garnet",
      "plum",
      "indigo",
      "teal",
      "forest",
      "olive",
    ]);
  });

  it("matches the spec's hex values", () => {
    expect(MEMBER_THEMES.find((t) => t.name === "amber")?.hex).toBe("#B45309");
    expect(MEMBER_THEMES.find((t) => t.name === "olive")?.hex).toBe("#55621C");
  });

  it("defaults to amber", () => {
    expect(DEFAULT_MEMBER_THEME).toBe("amber");
  });
});

describe("getMemberThemeHex", () => {
  it("returns the hex for a known theme", () => {
    expect(getMemberThemeHex("teal")).toBe("#17605F");
  });

  it("falls back to the first theme's hex for an unrecognized value", () => {
    // @ts-expect-error -- deliberately passing an invalid value to test the fallback
    expect(getMemberThemeHex("neon")).toBe("#B45309");
  });
});
