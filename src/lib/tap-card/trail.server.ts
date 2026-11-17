import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { offerForMember } from "@/lib/tap-card/offers-db.server";

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
