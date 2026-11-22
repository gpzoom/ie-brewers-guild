import type { SupabaseClient } from "@supabase/supabase-js";
import { STANDARD_OFFER, normalizeTrailOffer } from "@/lib/tap-card/tap-card-copy";

/**
 * The Beer Trail offer's wording, set on Guild Settings
 * (site_settings.trail_offer). The table is super-admin-only, so this reads
 * with the service role and only that column (no createServerFn here). Falls
 * back to the built-in wording if it can't be read, so the bar never breaks.
 */
export async function loadTrailOffer(service: SupabaseClient): Promise<string> {
  try {
    const { data, error } = await service.from("site_settings").select("trail_offer").eq("id", true).maybeSingle();
    if (error) throw error;
    return normalizeTrailOffer((data as { trail_offer?: string } | null)?.trail_offer) || STANDARD_OFFER;
  } catch (err) {
    console.error("loadTrailOffer: couldn't read site_settings, using the built-in offer", err);
    return STANDARD_OFFER;
  }
}
