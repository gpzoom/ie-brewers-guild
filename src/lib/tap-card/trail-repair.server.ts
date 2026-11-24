import type { SupabaseClient } from "@supabase/supabase-js";
import { clearTrailJoin, readHolderId, readTrailJoin } from "@/lib/tap-card/tap-card-cookies.server";
import { emptyCard } from "@/lib/tap-card/trail-pass-core";
import { trailPassStore } from "@/lib/tap-card/trail-pass-store.server";
import { planTrailRepair, type RepairPass } from "@/lib/tap-card/trail-repair";

/** What's on a card (passes include refunded ones). */
async function cardContents(service: SupabaseClient, holderId: string) {
  const count = async (table: string) => {
    const { count: n, error } = await service.from(table).select("holder_id", { count: "exact", head: true }).eq("holder_id", holderId);
    if (error) throw new Error(error.message);
    return n ?? 0;
  };
  const [visits, cards, passes, earned, milestones] = await Promise.all([
    count("tap_card_visits"),
    count("tap_cards"),
    count("tap_card_trail_passes"),
    count("tap_card_earned_rewards"),
    count("tap_card_rewards"),
  ]);
  return { visits, cards, passes, earned, milestones };
}

/** After its pass moved to `target`: remove the old card if nothing is left on it. */
export async function removeCardIfEmpty(service: SupabaseClient, old: string, target: string): Promise<boolean> {
  if (!emptyCard(await cardContents(service, old))) return false;
  // Keep any "email me" opt-ins: they belong to the person, now on the right card.
  const { data: subs, error: sError } = await service.from("tap_card_member_subscribers").select("member_id, opted_in_at").eq("holder_id", old);
  if (sError) throw new Error(sError.message);
  if ((subs ?? []).length > 0) {
    const { error: uError } = await service.from("tap_card_member_subscribers").upsert(
      (subs ?? []).map((s) => ({ member_id: s.member_id, holder_id: target, opted_in_at: s.opted_in_at })),
      { onConflict: "member_id,holder_id", ignoreDuplicates: true },
    );
    if (uError) throw new Error(uError.message);
  }
  const { error: dError } = await service.from("tap_card_holders").delete().eq("id", old);
  if (dError) throw new Error(dError.message);
  return true;
}

/**
 * Called once a card's email is proven (code or link), before its session
 * starts. If this browser's Beer Trail sign-up used another email, puts the
 * sale right. Returns the card to sign in to. Never stops a sign-in.
 */
export async function repairTrailJoin(service: SupabaseClient, holderId: string): Promise<string> {
  let target = holderId;
  try {
    const join = await readTrailJoin(service);
    if (!join) return target;
    const previousId = await readHolderId();
    const ids = previousId && previousId !== holderId ? [holderId, previousId] : [holderId];
    const [holders, passRows, contents, joinHolder] = await Promise.all([
      service.from("tap_card_holders").select("id, email").in("id", ids),
      service.from("tap_card_trail_passes").select("zeffy_payment_id, paid_at, member_id, year").eq("holder_id", holderId).is("refunded_at", null),
      cardContents(service, holderId),
      trailPassStore(service).findHolderByEmail(join.email),
    ]);
    if (holders.error) throw new Error(holders.error.message);
    if (passRows.error) throw new Error(passRows.error.message);
    const find = (id: string | null) => {
      const h = (holders.data ?? []).find((x) => x.id === id);
      return h ? { id: h.id as string, email: h.email as string } : null;
    };
    const card = find(holderId);
    if (!card) return target;
    const previous = previousId === holderId ? null : find(previousId);
    const passes: RepairPass[] = (passRows.data ?? []).map((p) => ({
      paymentId: p.zeffy_payment_id as string,
      paidAt: new Date(p.paid_at as string),
      memberId: p.member_id as string | null,
      year: p.year as number,
    }));
    let joinEmailPaid = false;
    if (joinHolder && joinHolder.id !== holderId) {
      const { count, error } = await service
        .from("tap_card_trail_passes")
        .select("id", { count: "exact", head: true })
        .eq("holder_id", joinHolder.id)
        .gte("paid_at", new Date(join.createdAt.getTime() - 2 * 60_000).toISOString());
      if (error) throw new Error(error.message);
      joinEmailPaid = (count ?? 0) > 0;
    }
    const plan = planTrailRepair({
      join,
      card,
      previous,
      passes,
      joinEmailPaid,
      previousYears: previous ? await trailPassStore(service).passYears(previous.id) : [],
      onlyThisPayment:
        new Set(passes.map((p) => p.paymentId)).size === 1 && emptyCard({ ...contents, passes: contents.passes - passes.length }),
    });
    if (!plan) return target;
    if (plan.creditTo) {
      const { error } = await service
        .from("tap_card_trail_passes")
        .update({ member_id: plan.creditTo })
        .eq("zeffy_payment_id", plan.paymentId)
        .is("member_id", null);
      if (error) throw new Error(error.message);
    }
    if (plan.moveTo) {
      const { error } = await service
        .from("tap_card_trail_passes")
        .update({ holder_id: plan.moveTo })
        .eq("zeffy_payment_id", plan.paymentId)
        .eq("holder_id", holderId);
      if (error) throw new Error(error.message);
      target = plan.moveTo;
    }
    if (plan.subscribeTo) await trailPassStore(service).addSubscriber(plan.subscribeTo, target, new Date());
    if (plan.moveTo) await removeCardIfEmpty(service, holderId, plan.moveTo);
    clearTrailJoin();
  } catch (err) {
    console.error("repairTrailJoin failed", err instanceof Error ? err.message : String(err));
  }
  return target;
}
