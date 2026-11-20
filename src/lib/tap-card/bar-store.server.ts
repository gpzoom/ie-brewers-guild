import type { SupabaseClient } from "@supabase/supabase-js";
import { isTrailStop } from "@/lib/tap-card/staff-qr";
import { holderHasTrailPass } from "@/lib/tap-card/trail-pass-store.server";
import type { BarStore } from "@/lib/tap-card/bar-core";
import { DEFAULT_EXPIRY_DAYS, type LiveOffer, type OfferSlot } from "@/lib/tap-card/loyalty";

/**
 * Database side of the bar rules (no createServerFn here). The unique indexes
 * from the migrations turn a double tap or two devices at once into
 * "duplicate"/"taken" instead of a second row.
 */
export function barStore(service: SupabaseClient): BarStore {
  const fail = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };
  return {
    async findVisit(holderId, memberId, day) {
      const { data, error } = await service
        .from("tap_card_visits")
        .select("id, redeemed_year")
        .eq("holder_id", holderId)
        .eq("member_id", memberId)
        .eq("visit_day", day)
        .maybeSingle();
      fail(error);
      return data ? { id: data.id, redeemedYear: data.redeemed_year } : null;
    },
    async insertVisit(v) {
      const { error } = await service.from("tap_card_visits").insert({
        holder_id: v.holderId,
        member_id: v.memberId,
        card_id: v.cardId,
        device_id: v.deviceId,
        visit_day: v.day,
      });
      if (!error) return "ok";
      if (error.code === "23505") return "duplicate";
      throw new Error(error.message);
    },
    async countVisits(holderId, memberId) {
      const { count, error } = await service
        .from("tap_card_visits")
        .select("id", { count: "exact", head: true })
        .eq("holder_id", holderId)
        .eq("member_id", memberId);
      fail(error);
      return count ?? 0;
    },
    async isTrailStop(memberId) {
      const { data, error } = await service.from("members").select("member_type, trail_eligible").eq("id", memberId).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? isTrailStop({ memberType: data.member_type, trailEligible: data.trail_eligible === true }) : false;
    },
    async hasTrailPass(holderId, year) {
      return holderHasTrailPass(service, holderId, year);
    },
    async trailRedeemedIn(holderId, memberId, year) {
      const { data, error } = await service
        .from("tap_card_visits")
        .select("id, visit_day")
        .eq("holder_id", holderId)
        .eq("member_id", memberId)
        .eq("redeemed_year", year)
        .maybeSingle();
      fail(error);
      return data ? { visitId: data.id, day: data.visit_day } : null;
    },
    async setTrailRedeemed(visitId, year) {
      const { error } = await service.from("tap_card_visits").update({ redeemed_year: year }).eq("id", visitId);
      if (!error) return "ok";
      if (error.code === "23505") return "duplicate";
      throw new Error(error.message);
    },
    async liveOffers(memberId) {
      const { data, error } = await service
        .from("tap_card_member_offers")
        .select("slot, live_visit_number, live_reward, live_terms")
        .eq("member_id", memberId)
        .not("live_reward", "is", null);
      fail(error);
      return (data ?? []).map(
        (o): LiveOffer => ({ slot: o.slot as OfferSlot, visitNumber: o.live_visit_number as number, reward: o.live_reward as string, terms: o.live_terms ?? "" }),
      );
    },
    async stepsEarned(holderId, memberId) {
      const { data, error } = await service
        .from("tap_card_earned_rewards")
        .select("slot")
        .eq("holder_id", holderId)
        .eq("member_id", memberId)
        .neq("slot", "repeat");
      fail(error);
      return new Set((data ?? []).map((r) => r.slot as OfferSlot));
    },
    async expiryDays(memberId) {
      const { data, error } = await service.from("tap_card_member_settings").select("reward_expiry_days").eq("member_id", memberId).maybeSingle();
      fail(error);
      return data?.reward_expiry_days ?? DEFAULT_EXPIRY_DAYS;
    },
    async insertEarned(r) {
      const { error } = await service.from("tap_card_earned_rewards").insert({
        holder_id: r.holderId,
        member_id: r.memberId,
        slot: r.slot,
        reward: r.reward,
        terms: r.terms,
        earned_visit_id: r.visitId,
        earned_at: r.earnedAt.toISOString(),
        expires_at: r.expiresAt.toISOString(),
      });
      if (!error) return "ok";
      if (error.code === "23505") return "duplicate";
      throw new Error(error.message);
    },
    async banked(holderId, memberId) {
      const { data, error } = await service
        .from("tap_card_earned_rewards")
        .select("id, reward, terms, expires_at, earned_at, slot, earned_visit_id")
        .eq("holder_id", holderId)
        .eq("member_id", memberId)
        .is("used_at", null)
        .order("expires_at");
      fail(error);
      return (data ?? []).map((r) => ({ id: r.id, reward: r.reward, terms: r.terms, expiresAt: r.expires_at, earnedAt: r.earned_at, slot: r.slot, visitId: r.earned_visit_id }));
    },
    async memberRewardUsedOn(visitId) {
      const { data, error } = await service
        .from("tap_card_earned_rewards")
        .select("id, reward, terms, expires_at")
        .eq("used_visit_id", visitId)
        .maybeSingle();
      fail(error);
      return data ? { id: data.id, reward: data.reward, terms: data.terms, expiresAt: data.expires_at } : null;
    },
    async markUsed(rewardId, visitId, deviceId, at) {
      const { data, error } = await service
        .from("tap_card_earned_rewards")
        .update({ used_at: at.toISOString(), used_visit_id: visitId, used_device_id: deviceId })
        .eq("id", rewardId)
        .is("used_at", null)
        .select("id");
      if (error?.code === "23505") return "taken";
      fail(error);
      return (data ?? []).length === 1 ? "ok" : "taken";
    },
    async clearUse(rewardId, visitId) {
      const { error } = await service
        .from("tap_card_earned_rewards")
        .update({ used_at: null, used_visit_id: null, used_device_id: null })
        .eq("id", rewardId)
        .eq("used_visit_id", visitId);
      fail(error);
    },
  };
}
