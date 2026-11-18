import type { SupabaseClient } from "@supabase/supabase-js";
import { STANDARD_OFFER } from "@/lib/tap-card/tap-card-copy";

/** Current trail stops: published producers the Guild has on the trail, with the Beer Trail offer (no createServerFn here). */
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
  return (data ?? []).map((r) => ({ memberId: r.id, name: r.business_name, slug: r.slug, city: r.city, offer: STANDARD_OFFER }));
}
