import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveOffer } from "@/lib/tap-card/offers";

/** The offer each stop shows right now (service-role reads; no createServerFn here). */
export async function offersForMembers(service: SupabaseClient, memberIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const id of memberIds) result.set(id, effectiveOffer(null));
  if (memberIds.length === 0) return result;
  const { data, error } = await service
    .from("tap_card_offers")
    .select("member_id, offer_text, status")
    .in("member_id", memberIds)
    .eq("status", "approved");
  if (error) throw new Error(error.message);
  for (const row of data ?? []) result.set(row.member_id, effectiveOffer({ offerText: row.offer_text, status: row.status }));
  return result;
}

export async function offerForMember(service: SupabaseClient, memberId: string): Promise<string> {
  return (await offersForMembers(service, [memberId])).get(memberId)!;
}
