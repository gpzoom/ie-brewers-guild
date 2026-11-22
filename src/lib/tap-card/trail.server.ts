import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { offerLabel, type OfferSlot } from "@/lib/tap-card/loyalty";
import { loadTrailOffer } from "@/lib/tap-card/trail-offer.server";
import { loadTrailStops, type TrailStop } from "@/lib/tap-card/trail-stops.server";
import { loadDirectory } from "@/lib/members/directory.server";
import type { DirectoryMember } from "@/lib/members/directory";

/**
 * Public Scan Pass facts. Only published trail stops, and only what their
 * public pages already show (the offer is public by design).
 */

export type StopTapCard = { trailOffer: string; memberOffers: { label: string; reward: string; terms: string }[] };

/** A trail stop's profile note: the Beer Trail offer and its approved loyalty rewards; null when it isn't a published trail stop. */
export const getStopTapCard = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => ({ slug: String(data?.slug ?? "") }))
  .handler(async ({ data }): Promise<StopTapCard | null> => {
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
    const { data: offers, error: offersError } = await service
      .from("tap_card_member_offers")
      .select("slot, live_visit_number, live_reward, live_terms")
      .eq("member_id", member.id)
      .not("live_reward", "is", null);
    if (offersError) throw new Error(offersError.message);
    const live = (offers ?? []).map((o) => ({
      slot: o.slot as OfferSlot,
      visitNumber: o.live_visit_number as number,
      reward: o.live_reward as string,
      terms: o.live_terms ?? "",
    }));
    const steps = live.filter((o) => o.slot !== "repeat").sort((x, y) => x.visitNumber - y.visitNumber);
    const repeat = live.filter((o) => o.slot === "repeat");
    return {
      trailOffer: await loadTrailOffer(service),
      memberOffers: [...steps, ...repeat].map((o) => ({ label: offerLabel(o.slot, o.visitNumber), reward: o.reward, terms: o.terms })),
    };
  });

export type TrailPageData = {
  /** For the map: directory entries, keeping only the trail-stop locations. */
  members: DirectoryMember[];
  stops: TrailStop[];
  /** The Beer Trail offer (Guild Settings), for the page headline. */
  trailOffer: string;
};

/** /trail: the published trail stops and their offers. */
export const getTrailPage = createServerFn({ method: "GET" }).handler(async (): Promise<TrailPageData> => {
  const service = await getSupabaseServiceRoleClient();
  const [stops, directory, trailOffer] = await Promise.all([
    loadTrailStops(service),
    // The public directory read (anon client), so the map shows exactly what /members shows.
    getSupabaseServerClient().then((anon) => loadDirectory(anon)),
    loadTrailOffer(service),
  ]);
  const slugs = new Set(stops.map((s) => s.slug));
  const members = directory.members
    .map((m) => ({ ...m, locations: m.locations.filter((l) => slugs.has(l.slug)) }))
    .filter((m) => m.locations.length > 0);
  return { members, stops, trailOffer };
});
