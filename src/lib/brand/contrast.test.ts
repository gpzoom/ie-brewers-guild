import { describe, expect, it } from "vitest";
import { contrastRatio, contrastRatioOfOklchStrings, meetsWcagAA, parseOklch, relativeLuminanceOfOklch } from "./contrast";

describe("relativeLuminanceOfOklch", () => {
  it("pure white is luminance 1", () => {
    expect(relativeLuminanceOfOklch(1, 0, 0)).toBeCloseTo(1, 5);
  });

  it("pure black is luminance 0", () => {
    expect(relativeLuminanceOfOklch(0, 0, 0)).toBeCloseTo(0, 5);
  });
});

describe("contrastRatio", () => {
  it("white against black is the maximum WCAG ratio, 21:1", () => {
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 1);
  });

  it("a color against itself is always 1:1", () => {
    expect(contrastRatio(0.4, 0.4)).toBeCloseTo(1, 5);
  });

  it("is symmetric regardless of argument order", () => {
    expect(contrastRatio(0.8, 0.1)).toBeCloseTo(contrastRatio(0.1, 0.8), 10);
  });
});

describe("parseOklch", () => {
  it("parses a plain oklch(L C H) string", () => {
    expect(parseOklch("oklch(0.58 0.15 50)")).toEqual({ l: 0.58, c: 0.15, h: 50 });
  });

  it("throws on a non-oklch string", () => {
    expect(() => parseOklch("#B3591F")).toThrow();
  });
});

describe("brand token contrast, against the Brand Design Tokens phase's approved values", () => {
  it("--brand with white text clears 4.5:1 (spec: 'solid fills with white text')", () => {
    expect(contrastRatioOfOklchStrings("oklch(0.58 0.15 50)", "oklch(1 0 0)")).toBeGreaterThanOrEqual(4.5);
  });

  it("--brand-bright with dark --ink text clears 4.5:1 (spec: 'fills with dark text')", () => {
    expect(contrastRatioOfOklchStrings("oklch(0.72 0.165 55)", "oklch(0.22 0.012 60)")).toBeGreaterThanOrEqual(4.5);
  });

  it("--brand-bright with white text FAILS -- the exact defect the two-amber split fixes", () => {
    expect(contrastRatioOfOklchStrings("oklch(0.72 0.165 55)", "oklch(1 0 0)")).toBeLessThan(4.5);
  });
});

describe("meetsWcagAA", () => {
  it("is true for the approved --brand/white pairing", () => {
    expect(meetsWcagAA("oklch(0.58 0.15 50)", "oklch(1 0 0)")).toBe(true);
  });

  it("is false for a too-light fill with white text", () => {
    expect(meetsWcagAA("oklch(0.9 0.1 50)", "oklch(1 0 0)")).toBe(false);
  });
});
