import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrailPassStore } from "@/lib/tap-card/trail-pass-core";

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
