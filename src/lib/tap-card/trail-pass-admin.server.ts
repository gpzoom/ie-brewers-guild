import { createServerFn } from "@tanstack/react-start";
import { requireTapCardGuildAdmin } from "@/lib/tap-card/guild-admin.server";
import { requireTapCardEditor } from "@/lib/tap-card/tap-card-editor.server";
import { monthlyCommission, type CommissionRow, type PassRow } from "@/lib/tap-card/trail-pass-report";
import { emptyCard } from "@/lib/tap-card/trail-pass-core";

/** Beer Trail Pass sales and commission (spec 2026-11-19). Guild sees everything; a brewery sees its own counts. */

export type TrailCampaignRow = { year: number; zeffyCampaignId: string; formUrl: string; commissionPct: number; unlockNow: boolean };
export type UnassignedPass = { id: string; paidAt: string; amountCents: number; holderName: string; holderEmail: string; refunded: boolean };
export type PassReport = {
  campaigns: TrailCampaignRow[];
  year: number;
  rows: (CommissionRow & { memberName: string | null })[];
  unassigned: UnassignedPass[];
  members: { id: string; name: string }[];
};

type Service = Awaited<ReturnType<typeof requireTapCardGuildAdmin>>["service"];

async function campaigns(service: Service): Promise<TrailCampaignRow[]> {
  const { data, error } = await service.from("tap_card_trail_campaigns").select("year, zeffy_campaign_id, form_url, commission_pct, unlock_now").order("year", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({ year: c.year, zeffyCampaignId: c.zeffy_campaign_id, formUrl: c.form_url, commissionPct: c.commission_pct, unlockNow: c.unlock_now === true }));
}

export const getPassReport = createServerFn({ method: "GET" })
  .inputValidator((data: { year?: number }) => ({ year: Number.isInteger(data?.year) ? (data.year as number) : null }))
  .handler(async ({ data }): Promise<PassReport> => {
    const { service } = await requireTapCardGuildAdmin();
    const all = await campaigns(service);
    const year = data.year ?? all[0]?.year ?? new Date().getFullYear();
    const pct = all.find((c) => c.year === year)?.commissionPct ?? 50;
    const [passes, plates] = await Promise.all([
      service
        .from("tap_card_trail_passes")
        .select("id, member_id, amount_cents, paid_at, refunded_at, members(business_name), tap_card_holders(name, email)")
        .eq("year", year)
        .order("paid_at", { ascending: false }),
      service.from("tap_card_plates").select("member_id, members!inner(business_name)"),
    ]);
    if (passes.error) throw new Error(passes.error.message);
    if (plates.error) throw new Error(plates.error.message);
    const nameOf = (m: unknown) => (m as { business_name: string } | null)?.business_name ?? null;
    const names = new Map<string, string>();
    for (const p of passes.data ?? []) if (p.member_id) names.set(p.member_id, nameOf(p.members) ?? "");
    const rows: PassRow[] = (passes.data ?? []).map((p) => ({ memberId: p.member_id, amountCents: p.amount_cents, paidAt: p.paid_at, refundedAt: p.refunded_at }));
    return {
      campaigns: all,
      year,
      rows: monthlyCommission(rows, pct).map((r) => ({ ...r, memberName: r.memberId ? (names.get(r.memberId) ?? null) : null })),
      unassigned: (passes.data ?? [])
        .filter((p) => !p.member_id)
        .map((p) => {
          const h = p.tap_card_holders as unknown as { name: string; email: string } | null;
          return { id: p.id, paidAt: p.paid_at, amountCents: p.amount_cents, holderName: h?.name ?? "", holderEmail: h?.email ?? "", refunded: p.refunded_at !== null };
        }),
      members: (plates.data ?? [])
        .map((p) => ({ id: p.member_id as string, name: nameOf(p.members) ?? "" }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

export const saveTrailCampaign = createServerFn({ method: "POST" })
  .inputValidator((data: TrailCampaignRow) => ({
    year: Number(data?.year),
    zeffyCampaignId: String(data?.zeffyCampaignId ?? "").trim(),
    formUrl: String(data?.formUrl ?? "").trim(),
    commissionPct: Number(data?.commissionPct),
    unlockNow: data?.unlockNow === true,
  }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { service } = await requireTapCardGuildAdmin();
    if (!Number.isInteger(data.year) || data.year < 2020 || data.year > 2100) throw new Error("Enter a year like 2027.");
    if (!data.zeffyCampaignId) throw new Error("Enter the Zeffy campaign ID.");
    if (!/^https:\/\/www\.zeffy\.com\//.test(data.formUrl)) throw new Error("Enter the Zeffy form link (https://www.zeffy.com/...).");
    if (!Number.isInteger(data.commissionPct) || data.commissionPct < 0 || data.commissionPct > 100) throw new Error("Commission is a whole percent from 0 to 100.");
    const { error } = await service.from("tap_card_trail_campaigns").upsert(
      { year: data.year, zeffy_campaign_id: data.zeffyCampaignId, form_url: data.formUrl, commission_pct: data.commissionPct, unlock_now: data.unlockNow },
      { onConflict: "year" },
    );
    if (error) throw new Error(error.code === "23505" ? "That Zeffy campaign is already used for another year." : error.message);
    return { ok: true };
  });

export type DemoResetResult = { members: number; visits: number; earned: number; misses: number; milestoneRewards: number };

/**
 * Demo kit "Reset demo visits" (same as `node scripts/demo-kit.mjs reset --yes`):
 * clears visits, earned rewards, staff activity and staff-code misses at the DRAFT members named
 * "Sample …", plus this year's Guild milestone rewards of customers who were only
 * ever active at those members. Passes, sign-ups and opt-ins are kept. Published
 * members are never touched, so real customers' visits are safe.
 */
export const resetDemoVisits = createServerFn({ method: "POST" }).handler(async (): Promise<DemoResetResult> => {
  const { service } = await requireTapCardGuildAdmin();
  const must = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message);
    return r.data as T;
  };
  const samples = must(await service.from("members").select("id").ilike("business_name", "sample %").eq("status", "draft"));
  const ids = samples.map((m) => m.id as string);
  if (!ids.length) throw new Error('No draft members named "Sample …" found.');
  const notSamples = `(${ids.join(",")})`;

  const [visits, earned, misses] = await Promise.all([
    must(await service.from("tap_card_visits").select("id, holder_id").in("member_id", ids)),
    must(await service.from("tap_card_earned_rewards").select("id").in("member_id", ids)),
    must(await service.from("tap_card_plate_misses").select("id").in("member_id", ids)),
  ]);

  // Customers whose activity is only at the Samples: their milestone rewards are demo rewards.
  const demoHolders: string[] = [];
  for (const id of new Set(visits.map((v) => v.holder_id as string | null).filter((h): h is string => !!h))) {
    const [otherVisits, otherPasses] = await Promise.all([
      must(await service.from("tap_card_visits").select("id").eq("holder_id", id).not("member_id", "in", notSamples).limit(1)),
      must(await service.from("tap_card_trail_passes").select("id").eq("holder_id", id).not("member_id", "in", notSamples).limit(1)),
    ]);
    if (!otherVisits.length && !otherPasses.length) demoHolders.push(id);
  }

  must(await service.from("tap_card_earned_rewards").delete().in("member_id", ids));
  // Staff activity too: deleting visits only unlinks it. Staff names and codes stay.
  must(await service.from("tap_card_staff_activity").delete().in("member_id", ids));
  must(await service.from("tap_card_visits").delete().in("member_id", ids));
  must(await service.from("tap_card_plate_misses").delete().in("member_id", ids));
  let milestoneRewards = 0;
  if (demoHolders.length) {
    const year = Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }).slice(0, 4));
    const deleted = must(await service.from("tap_card_rewards").delete().in("holder_id", demoHolders).gte("year", year).select("holder_id"));
    milestoneRewards = deleted.length;
  }
  return { members: ids.length, visits: visits.length, earned: earned.length, misses: misses.length, milestoneRewards };
});

export const assignPassToMember = createServerFn({ method: "POST" })
  .inputValidator((data: { passId: string; memberId: string }) => ({ passId: String(data?.passId ?? ""), memberId: String(data?.memberId ?? "") }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { service, userId } = await requireTapCardGuildAdmin();
    const { error } = await service
      .from("tap_card_trail_passes")
      .update({ member_id: data.memberId, assigned_by: userId })
      .eq("id", data.passId)
      .is("member_id", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type MemberPassSummary = { rows: CommissionRow[]; subscribers: number };

/** A brewery's own pass sales and opt-in count. Counts and money only -- no names or emails. */
export const getMemberPassSummary = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => ({ memberId: String(data?.memberId ?? "") }))
  .handler(async ({ data }): Promise<MemberPassSummary> => {
    const { service } = await requireTapCardEditor(data.memberId);
    const [passes, camps, subs] = await Promise.all([
      service.from("tap_card_trail_passes").select("year, amount_cents, paid_at, refunded_at").eq("member_id", data.memberId),
      service.from("tap_card_trail_campaigns").select("year, commission_pct"),
      service
        .from("tap_card_member_subscribers")
        .select("holder_id", { count: "exact", head: true })
        .eq("member_id", data.memberId)
        .is("unsubscribed_at", null),
    ]);
    for (const r of [passes, camps, subs]) if (r.error) throw new Error(r.error.message);
    const pctOf = new Map((camps.data ?? []).map((c) => [c.year as number, c.commission_pct as number]));
    const byYear = new Map<number, PassRow[]>();
    for (const p of passes.data ?? []) {
      const list = byYear.get(p.year) ?? [];
      list.push({ memberId: data.memberId, amountCents: p.amount_cents, paidAt: p.paid_at, refundedAt: p.refunded_at });
      byYear.set(p.year, list);
    }
    const rows = [...byYear.entries()].flatMap(([year, list]) => monthlyCommission(list, pctOf.get(year) ?? 50));
    rows.sort((a, b) => b.month.localeCompare(a.month));
    return { rows, subscribers: subs.count ?? 0 };
  });

export type PassListRow = { id: string; paidAt: string; amountCents: number; holderName: string; holderEmail: string; memberName: string | null; refunded: boolean };

/** The latest 100 passes for a trail year, for finding one to move. */
export const listPasses = createServerFn({ method: "GET" })
  .inputValidator((data: { year: number }) => ({ year: Number(data?.year) }))
  .handler(async ({ data }): Promise<PassListRow[]> => {
    const { service } = await requireTapCardGuildAdmin();
    const { data: rows, error } = await service
      .from("tap_card_trail_passes")
      .select("id, paid_at, amount_cents, refunded_at, members(business_name), tap_card_holders(name, email)")
      .eq("year", data.year)
      .order("paid_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((p) => {
      const h = p.tap_card_holders as unknown as { name: string; email: string } | null;
      const m = p.members as unknown as { business_name: string } | null;
      return { id: p.id, paidAt: p.paid_at, amountCents: p.amount_cents, holderName: h?.name ?? "", holderEmail: h?.email ?? "", memberName: m?.business_name ?? null, refunded: p.refunded_at !== null };
    });
  });

/**
 * A pass that landed on a new card by mistake (a different email on Zeffy):
 * move it to the card with this email. The old card is removed only if it now
 * has nothing on it.
 */
export const movePassToCard = createServerFn({ method: "POST" })
  .inputValidator((data: { passId: string; email: string }) => ({ passId: String(data?.passId ?? ""), email: String(data?.email ?? "").trim().toLowerCase() }))
  .handler(async ({ data }): Promise<{ ok: true; removedOldCard: boolean }> => {
    const { service } = await requireTapCardGuildAdmin();
    const [{ data: pass, error: pError }, { data: target, error: tError }] = await Promise.all([
      service.from("tap_card_trail_passes").select("id, holder_id").eq("id", data.passId).maybeSingle(),
      service.from("tap_card_holders").select("id").eq("email_lower", data.email).maybeSingle(),
    ]);
    if (pError) throw new Error(pError.message);
    if (tError) throw new Error(tError.message);
    if (!pass) throw new Error("That pass wasn't found.");
    if (!target) throw new Error("No Scan Pass uses that email.");
    if (pass.holder_id === target.id) return { ok: true, removedOldCard: false };
    const { error } = await service.from("tap_card_trail_passes").update({ holder_id: target.id }).eq("id", pass.id);
    if (error) throw new Error(error.message);
    const old = pass.holder_id as string | null;
    if (!old) return { ok: true, removedOldCard: false };
    const count = async (table: string) => {
      const { count: n, error: e } = await service.from(table).select("holder_id", { count: "exact", head: true }).eq("holder_id", old);
      if (e) throw new Error(e.message);
      return n ?? 0;
    };
    const [visits, cards, passes, earned, milestones] = await Promise.all([
      count("tap_card_visits"),
      count("tap_cards"),
      count("tap_card_trail_passes"),
      count("tap_card_earned_rewards"),
      count("tap_card_rewards"),
    ]);
    if (!emptyCard({ visits, cards, passes, earned, milestones })) return { ok: true, removedOldCard: false };
    // Keep any "email me" opt-ins: they belong to the person, now on the right card.
    const { data: subs, error: sError } = await service.from("tap_card_member_subscribers").select("member_id, opted_in_at").eq("holder_id", old);
    if (sError) throw new Error(sError.message);
    if ((subs ?? []).length > 0) {
      const { error: uError } = await service.from("tap_card_member_subscribers").upsert(
        (subs ?? []).map((s) => ({ member_id: s.member_id, holder_id: target.id, opted_in_at: s.opted_in_at })),
        { onConflict: "member_id,holder_id", ignoreDuplicates: true },
      );
      if (uError) throw new Error(uError.message);
    }
    const { error: dError } = await service.from("tap_card_holders").delete().eq("id", old);
    if (dError) throw new Error(dError.message);
    return { ok: true, removedOldCard: true };
  });
