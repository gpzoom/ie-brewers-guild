import type { SupabaseClient } from "@supabase/supabase-js";
import { offersForMembers } from "@/lib/tap-card/offers-db.server";

/** Current trail stops: published producers the Guild has on the trail, with their offers (no createServerFn here). */
export type TrailStop = { memberId: string; name: string; slug: string; city: string | null; offer: string };

export async function loadTrailStops(service: SupabaseClient): Promise<TrailStop[]> {
  const { data, error } = await service
    .from("members")
    .select("id, business_name, slug, city")
    .eq("status", "published")
    .eq("member_type", "producer")
    .eq("trail_eligible", true)
    .order("business_name");
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const offers = await offersForMembers(service, rows.map((r) => r.id));
  return rows.map((r) => ({ memberId: r.id, name: r.business_name, slug: r.slug, city: r.city, offer: offers.get(r.id)! }));
}
