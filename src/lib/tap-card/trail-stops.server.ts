import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTrailOffer } from "@/lib/tap-card/trail-offer.server";

/** Current trail stops: published producers the Guild has on the trail, with the Beer Trail offer (no createServerFn here). */
export type TrailStop = { memberId: string; name: string; slug: string; city: string | null; offer: string };

export async function loadTrailStops(service: SupabaseClient): Promise<TrailStop[]> {
  const [{ data, error }, offer] = await Promise.all([
    service
      .from("members")
      .select("id, business_name, slug, city")
      .eq("status", "published")
      .eq("member_type", "producer")
      .eq("trail_eligible", true)
      .order("business_name"),
    loadTrailOffer(service),
  ]);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ memberId: r.id, name: r.business_name, slug: r.slug, city: r.city, offer }));
}
