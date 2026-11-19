import type { SupabaseClient } from "@supabase/supabase-js";
import { passCountsNow, type TrailPassStore } from "@/lib/tap-card/trail-pass-core";
import { activeCampaignYear } from "@/lib/tap-card/trail-join";
import { tapCardYear } from "@/lib/tap-card/tap-card-time";

/** TrailPassStore on Supabase (service role). */
export function trailPassStore(service: SupabaseClient): TrailPassStore & { passYears(holderId: string): Promise<number[]> } {
  const findHolderByEmail = async (email: string) => {
    const { data, error } = await service
      .from("tap_card_holders")
      .select("id, created_at")
      .eq("email_lower", email.trim().toLowerCase())
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { id: data.id as string, createdAt: data.created_at as string } : null;
  };

  return {
    async campaignByZeffyId(id) {
      const { data, error } = await service.from("tap_card_trail_campaigns").select("year").eq("zeffy_campaign_id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { year: data.year as number } : null;
    },
    findHolderByEmail,
    async createHolder(h) {
      const { data, error } = await service
        .from("tap_card_holders")
        .insert({ name: h.name.slice(0, 80), email: h.email.trim(), age_confirmed_via: "customer" })
        .select("id")
        .single();
      if (error?.code === "23505") {
        // The webhook and the return page raced: the other one made it.
        const found = await findHolderByEmail(h.email);
        if (found) return { id: found.id };
      }
      if (error) throw new Error(error.message);
      return { id: data.id as string };
    },
    async latestJoin(email, before) {
      const { data, error } = await service
        .from("tap_card_trail_joins")
        .select("id, member_id, opt_in")
        .eq("email_lower", email.trim().toLowerCase())
        .lte("created_at", before.toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { id: data.id as string, memberId: (data.member_id as string | null) ?? null, optIn: data.opt_in as boolean } : null;
    },
    async insertPass(p) {
      const { error } = await service.from("tap_card_trail_passes").insert({
        zeffy_payment_id: p.paymentId,
        zeffy_item_id: p.itemId,
        holder_id: p.holderId,
        member_id: p.memberId,
        year: p.year,
        amount_cents: p.amountCents,
        paid_at: p.paidAt.toISOString(),
      });
      if (error?.code === "23505") return "duplicate";
      if (error) throw new Error(error.message);
      return "ok";
    },
    async hasPayment(paymentId) {
      const { data, error } = await service.from("tap_card_trail_passes").select("id").eq("zeffy_payment_id", paymentId).limit(1);
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
    async markRefunded(paymentId, at) {
      const { error } = await service
        .from("tap_card_trail_passes")
        .update({ refunded_at: at.toISOString() })
        .eq("zeffy_payment_id", paymentId)
        .is("refunded_at", null);
      if (error) throw new Error(error.message);
    },
    async addSubscriber(memberId, holderId, at) {
      const { error } = await service
        .from("tap_card_member_subscribers")
        .upsert({ member_id: memberId, holder_id: holderId, opted_in_at: at.toISOString() }, { onConflict: "member_id,holder_id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    },
    async passYears(holderId) {
      const { data, error } = await service.from("tap_card_trail_passes").select("year").eq("holder_id", holderId).is("refunded_at", null);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => r.year as number);
    },
  };
}

export type TrailCampaign = { year: number; zeffyCampaignId: string; formUrl: string };

/** The pass on sale now (see activeCampaignYear). */
export async function activeCampaign(service: SupabaseClient, now = new Date()): Promise<TrailCampaign | null> {
  const { data, error } = await service.from("tap_card_trail_campaigns").select("year, zeffy_campaign_id, form_url");
  if (error) throw new Error(error.message);
  const year = activeCampaignYear((data ?? []).map((c) => c.year as number), tapCardYear(now));
  const row = (data ?? []).find((c) => c.year === year);
  return row ? { year: row.year as number, zeffyCampaignId: row.zeffy_campaign_id as string, formUrl: row.form_url as string } : null;
}

/** True when a pass is on sale and this cardholder doesn't have it yet. */
export async function canJoinTrail(service: SupabaseClient, holderId: string | null): Promise<boolean> {
  const campaign = await activeCampaign(service);
  if (!campaign) return false;
  if (!holderId) return true;
  return !(await trailPassStore(service).passYears(holderId)).includes(campaign.year);
}

/** Other sign-ups (not this one) that used this email in a time window. */
export async function countOtherJoins(service: SupabaseClient, email: string, excludeId: string, from: Date, to: Date): Promise<number> {
  const { count, error } = await service
    .from("tap_card_trail_joins")
    .select("id", { count: "exact", head: true })
    .eq("email_lower", email.trim().toLowerCase())
    .neq("id", excludeId)
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Does this cardholder's pass unlock the Beer Trail in this year (see passCountsNow)? */
export async function holderHasTrailPass(service: SupabaseClient, holderId: string, year: number): Promise<boolean> {
  const [passes, unlocked] = await Promise.all([
    service.from("tap_card_trail_passes").select("year").eq("holder_id", holderId).is("refunded_at", null),
    service.from("tap_card_trail_campaigns").select("year").eq("unlock_now", true),
  ]);
  if (passes.error) throw new Error(passes.error.message);
  if (unlocked.error) throw new Error(unlocked.error.message);
  return passCountsNow(
    (passes.data ?? []).map((p) => p.year as number),
    (unlocked.data ?? []).map((c) => c.year as number),
    year,
  );
}
