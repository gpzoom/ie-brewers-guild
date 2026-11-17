import type { SupabaseClient } from "@supabase/supabase-js";
import type { CheckInStore } from "@/lib/tap-card/check-in-core";
import { newlyEarned, type Milestone } from "@/lib/tap-card/milestones";

/**
 * Database side of the check-in rules (no createServerFn here). The unique
 * indexes from the migration turn a double tap or two devices at once into
 * "duplicate" instead of a second row.
 */
export function checkInStore(service: SupabaseClient): CheckInStore {
  return {
    async findVisit(holderId, memberId, day) {
      const { data, error } = await service
        .from("tap_card_visits")
        .select("id, redeemed_year")
        .eq("holder_id", holderId)
        .eq("member_id", memberId)
        .eq("visit_day", day)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { id: data.id, redeemedYear: data.redeemed_year } : null;
    },
    async hasRedeemed(holderId, memberId, year) {
      const { data, error } = await service
        .from("tap_card_visits")
        .select("visit_day")
        .eq("holder_id", holderId)
        .eq("member_id", memberId)
        .eq("redeemed_year", year)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { day: data.visit_day } : null;
    },
    async insertVisit(v) {
      const { error } = await service.from("tap_card_visits").insert({
        holder_id: v.holderId,
        member_id: v.memberId,
        card_id: v.cardId,
        device_id: v.deviceId,
        visit_day: v.day,
        redeemed_year: v.redeemedYear,
      });
      if (!error) return "ok";
      if (error.code === "23505") return "duplicate";
      throw new Error(error.message);
    },
    async markRedeemed(visitId, year) {
      const { error } = await service.from("tap_card_visits").update({ redeemed_year: year }).eq("id", visitId);
      if (!error) return "ok";
      if (error.code === "23505") return "duplicate";
      throw new Error(error.message);
    },
  };
}

/** Distinct stops this holder visited in a calendar year. */
export async function distinctStopsInYear(service: SupabaseClient, holderId: string, year: number): Promise<number> {
  const { data, error } = await service
    .from("tap_card_visits")
    .select("member_id")
    .eq("holder_id", holderId)
    .gte("visit_day", `${year}-01-01`)
    .lte("visit_day", `${year}-12-31`);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((v) => v.member_id)).size;
}

/** Records any milestone the holder just reached this year; returns the newly earned rewards. */
export async function awardMilestones(service: SupabaseClient, holderId: string, year: number): Promise<Milestone[]> {
  const [{ data: milestones, error: mError }, { data: earned, error: eError }, stops] = await Promise.all([
    service.from("tap_card_milestones").select("id, stops_required, reward_text").eq("active", true),
    service.from("tap_card_rewards").select("milestone_id").eq("holder_id", holderId).eq("year", year),
    distinctStopsInYear(service, holderId, year),
  ]);
  if (mError) throw new Error(mError.message);
  if (eError) throw new Error(eError.message);
  const fresh = newlyEarned(
    (milestones ?? []).map((m) => ({ id: m.id, stopsRequired: m.stops_required, rewardText: m.reward_text })),
    stops,
    new Set((earned ?? []).map((r) => r.milestone_id)),
  );
  const awarded: Milestone[] = [];
  for (const m of fresh) {
    const { error } = await service.from("tap_card_rewards").insert({ holder_id: holderId, milestone_id: m.id, year });
    if (!error) awarded.push(m);
    else if (error.code !== "23505") throw new Error(error.message);
  }
  return awarded;
}
