import type { SupabaseClient } from "@supabase/supabase-js";
import { newlyEarned, type Milestone } from "@/lib/tap-card/milestones";

/** Guild milestone helpers (no createServerFn here). */

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
