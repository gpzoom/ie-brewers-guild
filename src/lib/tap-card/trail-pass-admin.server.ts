import { createServerFn } from "@tanstack/react-start";
import { requireTapCardGuildAdmin } from "@/lib/tap-card/guild-admin.server";
import { requireTapCardEditor } from "@/lib/tap-card/tap-card-editor.server";
import { monthlyCommission, type CommissionRow, type PassRow } from "@/lib/tap-card/trail-pass-report";

/** Beer Trail Pass sales and commission (spec 2026-11-19). Guild sees everything; a brewery sees its own counts. */

export type TrailCampaignRow = { year: number; zeffyCampaignId: string; formUrl: string; commissionPct: number };
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
  const { data, error } = await service.from("tap_card_trail_campaigns").select("year, zeffy_campaign_id, form_url, commission_pct").order("year", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({ year: c.year, zeffyCampaignId: c.zeffy_campaign_id, formUrl: c.form_url, commissionPct: c.commission_pct }));
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
  }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { service } = await requireTapCardGuildAdmin();
    if (!Number.isInteger(data.year) || data.year < 2020 || data.year > 2100) throw new Error("Enter a year like 2027.");
    if (!data.zeffyCampaignId) throw new Error("Enter the Zeffy campaign ID.");
    if (!/^https:\/\/www\.zeffy\.com\//.test(data.formUrl)) throw new Error("Enter the Zeffy form link (https://www.zeffy.com/...).");
    if (!Number.isInteger(data.commissionPct) || data.commissionPct < 0 || data.commissionPct > 100) throw new Error("Commission is a whole percent from 0 to 100.");
    const { error } = await service.from("tap_card_trail_campaigns").upsert(
      { year: data.year, zeffy_campaign_id: data.zeffyCampaignId, form_url: data.formUrl, commission_pct: data.commissionPct },
      { onConflict: "year" },
    );
    if (error) throw new Error(error.code === "23505" ? "That Zeffy campaign is already used for another year." : error.message);
    return { ok: true };
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
