import { createServerFn } from "@tanstack/react-start";
import { requireTapCardGuildAdmin } from "@/lib/tap-card/guild-admin.server";
import { validateMilestone } from "@/lib/tap-card/milestones";

/** Guild > Scan Pass > Milestones and Rewards (every Guild admin). */

export type MilestoneSummary = { id: string; stopsRequired: number; rewardText: string; active: boolean; earnedCount: number };

export const listMilestones = createServerFn({ method: "GET" }).handler(async (): Promise<MilestoneSummary[]> => {
  const { service } = await requireTapCardGuildAdmin();
  const [{ data, error }, { data: rewards, error: rError }] = await Promise.all([
    service.from("tap_card_milestones").select("id, stops_required, reward_text, active").order("stops_required"),
    service.from("tap_card_rewards").select("milestone_id"),
  ]);
  if (error) throw new Error(error.message);
  if (rError) throw new Error(rError.message);
  const counts = new Map<string, number>();
  for (const r of rewards ?? []) counts.set(r.milestone_id, (counts.get(r.milestone_id) ?? 0) + 1);
  return (data ?? []).map((m) => ({
    id: m.id,
    stopsRequired: m.stops_required,
    rewardText: m.reward_text,
    active: m.active,
    earnedCount: counts.get(m.id) ?? 0,
  }));
});

export const saveMilestone = createServerFn({ method: "POST" })
  .inputValidator((data: { id?: string; stopsRequired: number; rewardText: string; active: boolean }) => ({
    id: typeof data?.id === "string" && data.id ? data.id : null,
    stopsRequired: Number(data?.stopsRequired),
    rewardText: String(data?.rewardText ?? ""),
    active: data?.active !== false,
  }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { service } = await requireTapCardGuildAdmin();
    const checked = validateMilestone(data);
    if (!checked.ok) throw new Error(checked.message);
    const row = { stops_required: checked.value.stopsRequired, reward_text: checked.value.rewardText, active: data.active };
    const { error } = data.id
      ? await service.from("tap_card_milestones").update(row).eq("id", data.id)
      : await service.from("tap_card_milestones").insert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Refused once anyone has earned it -- turn it off instead, so earned rewards keep their name. */
export const deleteMilestone = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => ({ id: String(data?.id ?? "") }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { service } = await requireTapCardGuildAdmin();
    const { count, error: countError } = await service
      .from("tap_card_rewards")
      .select("id", { count: "exact", head: true })
      .eq("milestone_id", data.id);
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) > 0) throw new Error("Someone has already earned this reward. Turn it off instead.");
    const { error } = await service.from("tap_card_milestones").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type EarnedReward = {
  rewardId: string;
  holderName: string;
  holderEmail: string;
  rewardText: string;
  stopsRequired: number;
  earnedAt: string;
  handedOutAt: string | null;
};

export const listEarnedRewards = createServerFn({ method: "GET" })
  .inputValidator((data: { year: number; show: "waiting" | "all" }) => ({
    year: Number.isInteger(data?.year) ? data.year : new Date().getFullYear(),
    show: data?.show === "all" ? ("all" as const) : ("waiting" as const),
  }))
  .handler(async ({ data }): Promise<EarnedReward[]> => {
    const { service } = await requireTapCardGuildAdmin();
    let query = service
      .from("tap_card_rewards")
      .select("id, earned_at, handed_out_at, tap_card_holders(name, email), tap_card_milestones(reward_text, stops_required)")
      .eq("year", data.year)
      .order("earned_at");
    if (data.show === "waiting") query = query.is("handed_out_at", null);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const holder = r.tap_card_holders as unknown as { name: string; email: string } | null;
      const milestone = r.tap_card_milestones as unknown as { reward_text: string; stops_required: number } | null;
      return {
        rewardId: r.id,
        holderName: holder?.name ?? "",
        holderEmail: holder?.email ?? "",
        rewardText: milestone?.reward_text ?? "",
        stopsRequired: milestone?.stops_required ?? 0,
        earnedAt: r.earned_at,
        handedOutAt: r.handed_out_at,
      };
    });
  });

export const markRewardHandedOut = createServerFn({ method: "POST" })
  .inputValidator((data: { rewardId: string; handedOut: boolean }) => ({
    rewardId: String(data?.rewardId ?? ""),
    handedOut: data?.handedOut === true,
  }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { userId, service } = await requireTapCardGuildAdmin();
    const { error } = await service
      .from("tap_card_rewards")
      .update(data.handedOut ? { handed_out_at: new Date().toISOString(), handed_out_by: userId } : { handed_out_at: null, handed_out_by: null })
      .eq("id", data.rewardId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
