import { describe, expect, it } from "vitest";
import { BRAND_TOKEN_NAMES, buildBrandTokenCss, DEFAULT_BRAND_TOKENS } from "./default-tokens";

describe("DEFAULT_BRAND_TOKENS", () => {
  it("has exactly the sixteen token names from the Brand Design Tokens phase", () => {
    expect(Object.keys(DEFAULT_BRAND_TOKENS).sort()).toEqual([...BRAND_TOKEN_NAMES].sort());
  });

  it("matches the Brand Design Tokens phase's exact --brand value", () => {
    expect(DEFAULT_BRAND_TOKENS.brand).toBe("oklch(0.58 0.15 50)");
  });
});

describe("buildBrandTokenCss", () => {
  it("emits a :root block with every token as a -- prefixed custom property", () => {
    const css = buildBrandTokenCss(DEFAULT_BRAND_TOKENS);
    expect(css).toContain(":root {");
    expect(css).toContain("--bg: oklch(0.17 0.012 60);");
    expect(css).toContain("--brand-bright: oklch(0.72 0.165 55);");
    expect(css).toContain("--danger: oklch(0.55 0.17 27);");
  });

  it("round-trips a full custom token set with no missing keys", () => {
    const customTokens = { ...DEFAULT_BRAND_TOKENS, brand: "oklch(0.6 0.15 40)" };
    const css = buildBrandTokenCss(customTokens);
    for (const name of BRAND_TOKEN_NAMES) {
      expect(css).toContain(`--${name}: ${customTokens[name]};`);
    }
  });
});
