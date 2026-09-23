/**
 * WCAG 2.1 contrast math, computed directly from oklch() values rather than
 * round-tripping through hex, since the brand editor's inputs and the
 * Brand Design Tokens phase's stored values are both oklch. The OKLab<->
 * linear-sRGB conversion matrices are Björn Ottosson's published constants
 * (https://bottosson.github.io/posts/oklab/) -- the same ones behind CSS
 * Color 4's oklch(). WCAG 2.1's relative-luminance formula (§1.4.3) takes
 * LINEAR-light sRGB channels as input: despite its own confusingly-named
 * "R = RsRGB/12.92" delinearization step, that IS exactly the linear R/G/B
 * this module computes directly from OKLab, so no extra gamma round-trip
 * is needed before applying the luminance weights.
 */
function oklchToLinearSrgb(l: number, c: number, hDegrees: number): { r: number; g: number; b: number } {
  const hRadians = (hDegrees * Math.PI) / 180;
  const a = c * Math.cos(hRadians);
  const bLab = c * Math.sin(hRadians);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * bLab;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * bLab;
  const s_ = l - 0.0894841775 * a - 1.291485548 * bLab;

  const lCubed = l_ ** 3;
  const mCubed = m_ ** 3;
  const sCubed = s_ ** 3;

  const r = 4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed;
  const g = -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed;
  const bChannel = -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.707614701 * sCubed;

  return {
    r: Math.min(1, Math.max(0, r)),
    g: Math.min(1, Math.max(0, g)),
    b: Math.min(1, Math.max(0, bChannel)),
  };
}

function relativeLuminanceFromLinear(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function relativeLuminanceOfOklch(l: number, c: number, hDegrees: number): number {
  const { r, g, b } = oklchToLinearSrgb(l, c, hDegrees);
  return relativeLuminanceFromLinear(r, g, b);
}

export function contrastRatio(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function parseOklch(value: string): { l: number; c: number; h: number } {
  const match = value.trim().match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (!match) throw new Error(`Not a plain oklch(L C H) string: "${value}"`);
  return { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) };
}

export function contrastRatioOfOklchStrings(fillOklch: string, textOklch: string): number {
  const fill = parseOklch(fillOklch);
  const text = parseOklch(textOklch);
  return contrastRatio(
    relativeLuminanceOfOklch(fill.l, fill.c, fill.h),
    relativeLuminanceOfOklch(text.l, text.c, text.h),
  );
}

/** The spec's own bar: "refuses to save a combination that fails 4.5:1." */
export function meetsWcagAA(fillOklch: string, textOklch: string): boolean {
  return contrastRatioOfOklchStrings(fillOklch, textOklch) >= 4.5;
}
