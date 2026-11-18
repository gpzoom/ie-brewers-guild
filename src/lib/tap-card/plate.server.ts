import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { resolveEmailSiteUrl } from "@/lib/email/build-email-content";
import { currentRequestUrl } from "@/lib/request-url.server";
import { formatCardCode, generateCardCode, normalizeCardCode } from "@/lib/tap-card/card-code";
import { firstNameOf } from "@/lib/tap-card/card-view";
import { barState, checkInVisit, undoBarReward, useBarReward, type BarState, type RewardChoice } from "@/lib/tap-card/bar-core";
import { barStore } from "@/lib/tap-card/bar-store.server";
import { awardMilestones } from "@/lib/tap-card/tap-card-store.server";
import { readHolderId } from "@/lib/tap-card/tap-card-cookies.server";
import { requireTapCardEditor } from "@/lib/tap-card/tap-card-editor.server";
import { requireTapCardGuildAdmin } from "@/lib/tap-card/guild-admin.server";
import { tapCardDay, tapCardYear } from "@/lib/tap-card/tap-card-time";
import { PLATE_LOCK_MINUTES, PLATE_MAX_MISSES, plateUrl, staffCodeMatches, triesLeft, validateStaffCode } from "@/lib/tap-card/plate";

/**
 * Counter plate (/t/<code>): the customer's own phone, signed in to their
 * Tap Card, checks in at a brewery with no bar device -- but nothing is
 * recorded until the bartender types the brewery's staff code. Opening the
 * page only looks.
 */

type Plate = { memberId: string; memberName: string; staffCode: string | null; open: boolean };

async function loadPlate(service: SupabaseClient, rawCode: string): Promise<Plate | null> {
  const code = normalizeCardCode(rawCode);
  if (!code) return null;
  const { data, error } = await service
    .from("tap_card_plates")
    .select("member_id, staff_code, members!inner(business_name, status, member_type, trail_eligible)")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const m = data.members as unknown as { business_name: string; status: string; member_type: string; trail_eligible: boolean };
  return {
    memberId: data.member_id,
    memberName: m.business_name,
    staffCode: data.staff_code,
    open: m.status === "published" && m.member_type === "producer" && m.trail_eligible && data.staff_code !== null,
  };
}

/** A brewery's plate, made on first use (codes are random; a clash just tries again). */
async function ensurePlate(service: SupabaseClient, memberId: string): Promise<{ code: string; staffCode: string | null }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await service.from("tap_card_plates").select("code, staff_code").eq("member_id", memberId).maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return { code: data.code, staffCode: data.staff_code };
    const { error: insertError } = await service.from("tap_card_plates").insert({ member_id: memberId, code: generateCardCode() });
    if (insertError && insertError.code !== "23505") throw new Error(insertError.message);
  }
  throw new Error("Couldn't make the plate link. Try again.");
}

async function recentMisses(service: SupabaseClient, holderId: string, memberId: string): Promise<number> {
  const since = new Date(Date.now() - PLATE_LOCK_MINUTES * 60 * 1000).toISOString();
  const { count, error } = await service
    .from("tap_card_plate_misses")
    .select("id", { count: "exact", head: true })
    .eq("holder_id", holderId)
    .eq("member_id", memberId)
    .gte("missed_at", since);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export type PlateView =
  | { view: "unknown" }
  | { view: "closed"; memberName: string }
  | { view: "signed-out"; code: string; memberName: string }
  | { view: "ready"; code: string; memberName: string; firstName: string; nextVisitNumber: number; checkedInToday: boolean; state: BarState };

export const getPlateView = createServerFn({ method: "GET" })
  .inputValidator((data: { code: string }) => ({ code: String(data?.code ?? "") }))
  .handler(async ({ data }): Promise<PlateView> => {
    const service = await getSupabaseServiceRoleClient();
    const plate = await loadPlate(service, data.code);
    if (!plate) return { view: "unknown" };
    if (!plate.open) return { view: "closed", memberName: plate.memberName };
    const code = normalizeCardCode(data.code)!;
    const holderId = await readHolderId();
    if (!holderId) return { view: "signed-out", code, memberName: plate.memberName };
    const { data: holder, error } = await service.from("tap_card_holders").select("name").eq("id", holderId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!holder) return { view: "signed-out", code, memberName: plate.memberName };
    const store = barStore(service);
    const at = new Date();
    const today = await store.findVisit(holderId, plate.memberId, tapCardDay(at));
    const state = await barState(store, { holderId, memberId: plate.memberId, cardId: null, deviceId: null, at, firstToday: false, newlyEarned: [] });
    return {
      view: "ready",
      code,
      memberName: plate.memberName,
      firstName: firstNameOf(holder.name),
      nextVisitNumber: today ? state.visitNumber : state.visitNumber + 1,
      checkedInToday: today !== null,
      state,
    };
  });

export type PlateChoice = { kind: "none" } | RewardChoice;
export type PlateResult =
  | { kind: "ok"; state: BarState; milestoneRewards: string[]; outcome?: "used" | "already-used-today" | "not-available" | "undone" | "nothing-to-undo" }
  | { kind: "wrong-code"; triesLeft: number }
  | { kind: "locked" }
  | { kind: "signed-out" }
  | { kind: "closed" };

/** Holder + plate + a checked staff code, or the reason to refuse. */
async function plateContext(rawCode: string, staffCode: string) {
  const service = await getSupabaseServiceRoleClient();
  const plate = await loadPlate(service, rawCode);
  if (!plate?.open) return { refuse: { kind: "closed" } as PlateResult };
  const holderId = await readHolderId();
  if (!holderId) return { refuse: { kind: "signed-out" } as PlateResult };
  const misses = await recentMisses(service, holderId, plate.memberId);
  if (misses >= PLATE_MAX_MISSES) return { refuse: { kind: "locked" } as PlateResult };
  if (!staffCodeMatches(staffCode, plate.staffCode)) {
    const { error } = await service.from("tap_card_plate_misses").insert({ holder_id: holderId, member_id: plate.memberId });
    if (error) throw new Error(error.message);
    const left = triesLeft(misses + 1);
    return { refuse: (left === 0 ? { kind: "locked" } : { kind: "wrong-code", triesLeft: left }) as PlateResult };
  }
  return { service, input: { holderId, memberId: plate.memberId, cardId: null, deviceId: null, at: new Date() } };
}

export const confirmAtPlate = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string; staffCode: string; choice: PlateChoice }) => ({
    code: String(data?.code ?? ""),
    staffCode: String(data?.staffCode ?? ""),
    choice: (data?.choice?.kind === "member"
      ? { kind: "member", id: String(data.choice.id ?? "") }
      : data?.choice?.kind === "trail"
        ? { kind: "trail" }
        : { kind: "none" }) as PlateChoice,
  }))
  .handler(async ({ data }): Promise<PlateResult> => {
    const ctx = await plateContext(data.code, data.staffCode);
    if ("refuse" in ctx) return ctx.refuse!;
    const store = barStore(ctx.service);
    let state = await checkInVisit(store, ctx.input);
    const milestoneRewards = state.firstToday
      ? (await awardMilestones(ctx.service, ctx.input.holderId, tapCardYear(ctx.input.at))).map((m) => m.rewardText)
      : [];
    if (data.choice.kind === "none") return { kind: "ok", state, milestoneRewards };
    const used = await useBarReward(store, { ...ctx.input, choice: data.choice });
    state = { ...used.state, firstToday: state.firstToday, newlyEarned: state.newlyEarned };
    return { kind: "ok", state, milestoneRewards, outcome: used.outcome };
  });

export const undoAtPlate = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string; staffCode: string }) => ({ code: String(data?.code ?? ""), staffCode: String(data?.staffCode ?? "") }))
  .handler(async ({ data }): Promise<PlateResult> => {
    const ctx = await plateContext(data.code, data.staffCode);
    if ("refuse" in ctx) return ctx.refuse!;
    const { outcome, state } = await undoBarReward(barStore(ctx.service), ctx.input);
    return { kind: "ok", state, milestoneRewards: [], outcome };
  });

// ---- The brewery's Counter plate box (Portal/Admin > Tap Card) ----

export type CounterPlate = { url: string; printedCode: string; staffCode: string | null };

export const getCounterPlate = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => ({ memberId: String(data?.memberId ?? "") }))
  .handler(async ({ data }): Promise<CounterPlate> => {
    const { service } = await requireTapCardEditor(data.memberId);
    const plate = await ensurePlate(service, data.memberId);
    return { url: plateUrl(resolveEmailSiteUrl(currentRequestUrl()), plate.code), printedCode: formatCardCode(plate.code), staffCode: plate.staffCode };
  });

export const saveStaffCode = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; staffCode: string }) => ({ memberId: String(data?.memberId ?? ""), staffCode: String(data?.staffCode ?? "") }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const checked = validateStaffCode(data.staffCode);
    if (!checked.ok) throw new Error(checked.message);
    const { service } = await requireTapCardEditor(data.memberId);
    await ensurePlate(service, data.memberId);
    const { error } = await service
      .from("tap_card_plates")
      .update({ staff_code: checked.code, updated_at: new Date().toISOString() })
      .eq("member_id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** A lost or stolen plate: a new link; the old plate stops working. The staff code stays. */
export const resetPlateLink = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => ({ memberId: String(data?.memberId ?? "") }))
  .handler(async ({ data }): Promise<CounterPlate> => {
    const { service } = await requireTapCardEditor(data.memberId);
    const current = await ensurePlate(service, data.memberId);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCardCode();
      const { error } = await service
        .from("tap_card_plates")
        .update({ code, updated_at: new Date().toISOString() })
        .eq("member_id", data.memberId);
      if (!error) return { url: plateUrl(resolveEmailSiteUrl(currentRequestUrl()), code), printedCode: formatCardCode(code), staffCode: current.staffCode };
      if (error.code !== "23505") throw new Error(error.message);
    }
    throw new Error("Couldn't make a new plate link. Try again.");
  });

/** Guild > Tap Card > Cards: every trail stop's plate link, for the printer (plates are made as needed). */
export const downloadPlateLinksCsv = createServerFn({ method: "POST" }).handler(async (): Promise<{ filename: string; csv: string }> => {
  const { service } = await requireTapCardGuildAdmin();
  const { data: members, error } = await service
    .from("members")
    .select("id, business_name")
    .eq("member_type", "producer")
    .eq("trail_eligible", true)
    .in("status", ["draft", "published"])
    .order("business_name");
  if (error) throw new Error(error.message);
  const site = resolveEmailSiteUrl(currentRequestUrl());
  const quote = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = ["brewery,code,printed_code,url"];
  for (const m of members ?? []) {
    const plate = await ensurePlate(service, m.id);
    rows.push([quote(m.business_name), plate.code, formatCardCode(plate.code), plateUrl(site, plate.code)].join(","));
  }
  return { filename: "tap-card-counter-plates.csv", csv: rows.join("\n") + "\n" };
});
