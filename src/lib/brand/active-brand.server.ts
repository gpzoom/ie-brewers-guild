import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { buildBrandTokenCss, DEFAULT_BRAND_TOKENS, type BrandTokens } from "@/lib/brand/default-tokens";
import { DEFAULT_FONT_PAIRING_ID, getFontPairingById } from "@/lib/brand/font-pairings";
import type { BrandSettingsRow } from "@/lib/supabase/types";

export type ActiveBrand = {
  css: string;
  googleFontsHref: string;
  displayFamily: string;
  bodyFamily: string;
};

/**
 * Reads the one brand_settings row (service-role, since the row's own RLS
 * is guild-admin-only and this read serves the whole public site, not an
 * authenticated admin request) and falls back to the Brand Design Tokens
 * phase's static defaults when no row exists yet -- "don't require a
 * Guild admin to touch this screen before the site looks right" (task
 * brief). Every page reads this once, centrally, from the root route's own
 * loader (Step 2) -- never per-component.
 */
export const getActiveBrandTokens = createServerFn({ method: "GET" }).handler(async (): Promise<ActiveBrand> => {
  const supabase = await getSupabaseServiceRoleClient();
  const { data } = await supabase.from("brand_settings").select("*").maybeSingle();
  const row = data as BrandSettingsRow | null;

  const tokens: BrandTokens = row ? (row.tokens as BrandTokens) : DEFAULT_BRAND_TOKENS;
  const fontPairing = getFontPairingById(row?.font_pairing ?? DEFAULT_FONT_PAIRING_ID) ?? getFontPairingById(DEFAULT_FONT_PAIRING_ID)!;

  const fontVarsCss = `--font-display: "${fontPairing.displayFamily}", system-ui, sans-serif;\n  --font-sans: "${fontPairing.bodyFamily}", system-ui, -apple-system, sans-serif;`;
  const tokenCss = buildBrandTokenCss(tokens);
  // Splice the font-family variables into the same :root block the token
  // CSS builds, so one <style> tag carries both -- never two separate
  // injection points.
  const css = tokenCss.replace(":root {\n", `:root {\n  ${fontVarsCss}\n`);

  return {
    css,
    googleFontsHref: fontPairing.googleFontsHref,
    displayFamily: fontPairing.displayFamily,
    bodyFamily: fontPairing.bodyFamily,
  };
});
