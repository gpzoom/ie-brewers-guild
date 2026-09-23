import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { DEFAULT_BRAND_TOKENS, type BrandTokens } from "@/lib/brand/default-tokens";
import { getFontPairingById } from "@/lib/brand/font-pairings";
import { meetsWcagAA } from "@/lib/brand/contrast";
import type { BrandSettingsRow } from "@/lib/supabase/types";

/**
 * The editor exposes exactly three colour controls -- a shared hue plus
 * --brand's and --brand-bright's independent lightness values (this
 * plan's Decision 11) -- and a font-pairing id from the curated catalog.
 * Chroma stays fixed at the spec's approved values.
 */
export type SaveBrandSettingsInput = {
  hue: number;
  brandLightness: number;
  brandBrightLightness: number;
  fontPairingId: string;
};

const BRAND_CHROMA = 0.15;
const BRAND_BRIGHT_CHROMA = 0.165;
const WHITE_OKLCH = "oklch(1 0 0)";

export const getBrandSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ fontPairingId: string; tokens: BrandTokens } | null> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data, error } = await supabase.from("brand_settings").select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as BrandSettingsRow;
    return { fontPairingId: row.font_pairing, tokens: row.tokens as BrandTokens };
  },
);

/**
 * Refuses to save a failing combination (spec: "refuses to save a
 * combination that fails 4.5:1") -- validated here, server-side, not only
 * in the editor UI, since this is the actual boundary a bad value could
 * cross. On success, only the brand/brand-bright keys change; every other
 * token is carried through unchanged from the current row, or from
 * DEFAULT_BRAND_TOKENS on the very first save (this plan's Decision 12).
 */
export const saveBrandSettings = createServerFn({ method: "POST" })
  .inputValidator((data: SaveBrandSettingsInput) => data)
  .handler(async ({ data }) => {
    if (!getFontPairingById(data.fontPairingId)) {
      throw new Error("Unknown font pairing.");
    }
    if (data.hue < 0 || data.hue >= 360) {
      throw new Error("Hue must be between 0 and 360.");
    }
    if (data.brandLightness <= 0 || data.brandLightness >= 1 || data.brandBrightLightness <= 0 || data.brandBrightLightness >= 1) {
      throw new Error("Lightness must be between 0 and 1.");
    }

    const brandOklch = `oklch(${data.brandLightness} ${BRAND_CHROMA} ${data.hue})`;
    const brandBrightOklch = `oklch(${data.brandBrightLightness} ${BRAND_BRIGHT_CHROMA} ${data.hue})`;

    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error("Not signed in.");

    const { data: existing, error: existingError } = await supabase.from("brand_settings").select("*").maybeSingle();
    if (existingError) throw new Error(existingError.message);
    const currentTokens = (existing as BrandSettingsRow | null)?.tokens ?? DEFAULT_BRAND_TOKENS;

    if (!meetsWcagAA(brandOklch, WHITE_OKLCH)) {
      throw new Error("This amber is too light for white text on --brand. Lower the lightness and try again.");
    }
    const inkOklch = (currentTokens as BrandTokens).ink ?? DEFAULT_BRAND_TOKENS.ink;
    if (!meetsWcagAA(brandBrightOklch, inkOklch)) {
      throw new Error("This amber is too dark for dark text on --brand-bright. Raise the lightness and try again.");
    }

    const nextTokens: BrandTokens = {
      ...(currentTokens as BrandTokens),
      brand: brandOklch,
      "brand-bright": brandBrightOklch,
    };

    const payload = {
      font_pairing: data.fontPairingId,
      tokens: nextTokens,
      updated_by_user_id: userData.user.id,
      updated_at: new Date().toISOString(),
    };

    const { error: writeError } = existing
      ? await supabase.from("brand_settings").update(payload).eq("id", (existing as BrandSettingsRow).id)
      : await supabase.from("brand_settings").insert(payload);
    if (writeError) throw new Error(writeError.message);

    return { ok: true as const, tokens: nextTokens };
  });
