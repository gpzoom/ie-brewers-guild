/**
 * The sixteen CSS custom properties the Brand Design Tokens phase defined
 * on :root (src/styles.css), keyed here by their bare name minus the
 * leading "--" so a stored JSON value round-trips losslessly into CSS by
 * simple string interpolation (this plan's Decision 12). DEFAULT_BRAND_TOKENS
 * is copied verbatim from that phase's approved oklch table -- the
 * fallback used whenever no brand_settings row exists yet (task brief:
 * "don't require a Guild admin to touch this screen before the site looks
 * right").
 */
export const BRAND_TOKEN_NAMES = [
  "bg",
  "surface",
  "surface-2",
  "border-dark",
  "text",
  "text-muted",
  "canvas",
  "canvas-2",
  "canvas-border",
  "ink",
  "ink-muted",
  "brand",
  "brand-bright",
  "open",
  "warn",
  "danger",
] as const;

export type BrandTokenName = (typeof BRAND_TOKEN_NAMES)[number];

export type BrandTokens = Record<BrandTokenName, string>;

export const DEFAULT_BRAND_TOKENS: BrandTokens = {
  bg: "oklch(0.17 0.012 60)",
  surface: "oklch(0.21 0.014 60)",
  "surface-2": "oklch(0.25 0.014 60)",
  "border-dark": "oklch(0.31 0.015 60)",
  text: "oklch(0.96 0.012 80)",
  "text-muted": "oklch(0.74 0.018 70)",
  canvas: "oklch(0.97 0.008 80)",
  "canvas-2": "oklch(0.94 0.01 80)",
  "canvas-border": "oklch(0.88 0.012 80)",
  ink: "oklch(0.22 0.012 60)",
  "ink-muted": "oklch(0.46 0.012 70)",
  brand: "oklch(0.58 0.15 50)",
  "brand-bright": "oklch(0.72 0.165 55)",
  open: "oklch(0.62 0.15 145)",
  warn: "oklch(0.68 0.13 75)",
  danger: "oklch(0.55 0.17 27)",
};

/**
 * Emits a :root { --token: value; ... } block, in BRAND_TOKEN_NAMES's fixed
 * order, for every one of the sixteen tokens -- never a partial set. The
 * root route (Task 28) injects this string directly as a <style> tag,
 * ordered after the compiled Tailwind stylesheet so these :root
 * declarations win the cascade over styles.css's own defaults.
 */
export function buildBrandTokenCss(tokens: BrandTokens): string {
  const lines = BRAND_TOKEN_NAMES.map((name) => `  --${name}: ${tokens[name]};`);
  return `:root {\n${lines.join("\n")}\n}`;
}
