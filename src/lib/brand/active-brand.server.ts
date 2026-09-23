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
  let row: BrandSettingsRow | null = null;
  try {
    const supabase = await getSupabaseServiceRoleClient();
    const { data } = await supabase.from("brand_settings").select("*").maybeSingle();
    row = data as BrandSettingsRow | null;
  } catch (err) {
    // getSupabaseServiceRoleClient() throws synchronously when
    // VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are missing from the
    // Worker environment. This function now runs on every page load via
    // __root.tsx's loader, so a deployment misconfiguration here must
    // degrade to the same default-tokens fallback used below for "no
    // brand_settings row yet" -- not take down every public page. Still
    // console.error'd so a genuine misconfiguration stays visible in
    // Worker logs.
    console.error("getActiveBrandTokens: failed to read brand_settings, falling back to defaults", err);
  }

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
