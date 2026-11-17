import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { offerForMember } from "@/lib/tap-card/offers-db.server";
import { loadTrailStops, type TrailStop } from "@/lib/tap-card/trail-stops.server";
import { loadDirectory } from "@/lib/members/directory.server";
import type { DirectoryMember } from "@/lib/members/directory";
import { DEFAULT_TAP_CARD_PRICE_CENTS } from "@/lib/guild/site-settings";

/**
 * Public Tap Card facts. Only published trail stops, and only what their
 * public pages already show (the offer is public by design).
 */

/** A stop's current offer for its profile page; null when it isn't a published trail stop. */
export const getStopOffer = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => ({ slug: String(data?.slug ?? "") }))
  .handler(async ({ data }): Promise<string | null> => {
    const service = await getSupabaseServiceRoleClient();
    const { data: member, error } = await service
      .from("members")
      .select("id")
      .eq("slug", data.slug)
      .eq("status", "published")
      .eq("member_type", "producer")
      .eq("trail_eligible", true)
      .maybeSingle();
    if (error || !member) return null;
    return offerForMember(service, member.id);
  });

export type TrailPageData = {
  /** For the map: directory entries, keeping only the trail-stop locations. */
  members: DirectoryMember[];
  stops: TrailStop[];
  cardPriceCents: number;
};

/** /trail: the published trail stops, their offers, and the suggested card price. */
export const getTrailPage = createServerFn({ method: "GET" }).handler(async (): Promise<TrailPageData> => {
  const service = await getSupabaseServiceRoleClient();
  const [stops, directory, settings] = await Promise.all([
    loadTrailStops(service),
    // The public directory read (anon client), so the map shows exactly what /members shows.
    getSupabaseServerClient().then((anon) => loadDirectory(anon)),
    service.from("site_settings").select("tap_card_price_cents").eq("id", true).maybeSingle(),
  ]);
  const slugs = new Set(stops.map((s) => s.slug));
  const members = directory.members
    .map((m) => ({ ...m, locations: m.locations.filter((l) => slugs.has(l.slug)) }))
    .filter((m) => m.locations.length > 0);
  const price = settings.data?.tap_card_price_cents;
  return { members, stops, cardPriceCents: typeof price === "number" ? price : DEFAULT_TAP_CARD_PRICE_CENTS };
});
