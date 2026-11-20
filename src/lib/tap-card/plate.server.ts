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
import { claimPlatePending, onStagingSite, readHolderId, readPlatePending, setPlatePending } from "@/lib/tap-card/tap-card-cookies.server";
import { decideStaffQrView, isStaffQrToken, isTrailStop, memberTakesCheckIns, parsePendingChoice, staffQrUrl, type PendingChoice } from "@/lib/tap-card/staff-qr";
import { requireTapCardEditor } from "@/lib/tap-card/tap-card-editor.server";
import { requireTapCardGuildAdmin } from "@/lib/tap-card/guild-admin.server";
import { tapCardDay, tapCardYear } from "@/lib/tap-card/tap-card-time";
import { canJoinTrail } from "@/lib/tap-card/trail-pass-store.server";
import { PLATE_LOCK_MINUTES, plateUrl, staffCodeGate, validateStaffCode, type AttemptStore } from "@/lib/tap-card/plate";

/**
 * Counter plate (/t/<code>): the customer's own phone, signed in to their
 * Tap Card, checks in at a brewery with no bar device -- but nothing is
 * recorded until the staff member types the brewery's staff code. Opening the
 * page only looks.
 */

type Plate = { memberId: string; memberName: string; memberSlug: string; staffCode: string | null; open: boolean; trailStop: boolean };

async function loadPlate(service: SupabaseClient, rawCode: string): Promise<Plate | null> {
  const code = normalizeCardCode(rawCode);
  if (!code) return null;
  const { data, error } = await service
    .from("tap_card_plates")
    .select("member_id, staff_code, members!inner(business_name, slug, status, member_type, trail_eligible)")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const m = data.members as unknown as { business_name: string; slug: string; status: string; member_type: string; trail_eligible: boolean };
  return {
    memberId: data.member_id,
    memberName: m.business_name,
    memberSlug: m.slug,
    staffCode: data.staff_code,
    trailStop: isTrailStop({ memberType: m.member_type, trailEligible: m.trail_eligible === true }),
    // The staff code still turns the plate on (it's the backup to the staff QR).
    open: memberTakesCheckIns({ status: m.status, memberType: m.member_type, trailEligible: m.trail_eligible }, onStagingSite()) && data.staff_code !== null,
  };
}

/** A brewery's plate, made on first use (codes are random; a clash just tries again). */
async function ensurePlate(service: SupabaseClient, memberId: string): Promise<{ code: string; staffCode: string | null; staffQr: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await service.from("tap_card_plates").select("code, staff_code, staff_qr").eq("member_id", memberId).maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.staff_qr) return { code: data.code, staffCode: data.staff_code, staffQr: data.staff_qr };
    if (data) {
      // A plate made before the staff QR (or before 8-character codes): give it one now.
      const { error: qrError } = await service
        .from("tap_card_plates")
        .update({ staff_qr: generateCardCode() })
        .eq("member_id", memberId)
        .is("staff_qr", null);
      if (qrError && qrError.code !== "23505") throw new Error(qrError.message);
      continue;
    }
    const { error: insertError } = await service
      .from("tap_card_plates")
      .insert({ member_id: memberId, code: generateCardCode(), staff_qr: generateCardCode() });
    if (insertError && insertError.code !== "23505") throw new Error(insertError.message);
  }
  throw new Error("Couldn't make the plate link. Try again.");
}

/** Staff-code tries for one customer at one plate (rows in tap_card_plate_misses). */
function attemptStore(service: SupabaseClient, holderId: string, memberId: string): AttemptStore {
  return {
    async record() {
      const { data, error } = await service.from("tap_card_plate_misses").insert({ holder_id: holderId, member_id: memberId }).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "Couldn't check the code.");
      return data.id;
    },
    async recent() {
      const since = new Date(Date.now() - PLATE_LOCK_MINUTES * 60 * 1000).toISOString();
      const { count, error } = await service
        .from("tap_card_plate_misses")
        .select("id", { count: "exact", head: true })
        .eq("holder_id", holderId)
        .eq("member_id", memberId)
        .gte("missed_at", since);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async clear(id) {
      const { error } = await service.from("tap_card_plate_misses").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}

export type PlateView =
  | { view: "unknown" }
  | { view: "closed"; memberName: string }
  | { view: "signed-out"; code: string; memberName: string; canJoinTrail: boolean; trailStop: boolean }
  | { view: "ready"; code: string; memberName: string; memberSlug: string; firstName: string; nextVisitNumber: number; checkedInToday: boolean; canJoinTrail: boolean; trailStop: boolean; state: BarState };

export const getPlateView = createServerFn({ method: "GET" })
  .inputValidator((data: { code: string }) => ({ code: String(data?.code ?? "") }))
  .handler(async ({ data }): Promise<PlateView> => {
    const service = await getSupabaseServiceRoleClient();
    const plate = await loadPlate(service, data.code);
    if (!plate) return { view: "unknown" };
    if (!plate.open) return { view: "closed", memberName: plate.memberName };
    const code = normalizeCardCode(data.code)!;
    const holderId = await readHolderId();
    if (!holderId) return { view: "signed-out", code, memberName: plate.memberName, canJoinTrail: await canJoinTrail(service, null), trailStop: plate.trailStop };
    const { data: holder, error } = await service.from("tap_card_holders").select("name").eq("id", holderId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!holder) return { view: "signed-out", code, memberName: plate.memberName, canJoinTrail: await canJoinTrail(service, null), trailStop: plate.trailStop };
    const store = barStore(service);
    const at = new Date();
    const today = await store.findVisit(holderId, plate.memberId, tapCardDay(at));
    const state = await barState(store, { holderId, memberId: plate.memberId, cardId: null, deviceId: null, at, firstToday: false, newlyEarned: [] });
    return {
      view: "ready",
      code,
      memberName: plate.memberName,
      memberSlug: plate.memberSlug,
      firstName: firstNameOf(holder.name),
      nextVisitNumber: today ? state.visitNumber : state.visitNumber + 1,
      checkedInToday: today !== null,
      canJoinTrail: await canJoinTrail(service, holderId),
      trailStop: plate.trailStop,
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
  const gate = await staffCodeGate(attemptStore(service, holderId, plate.memberId), staffCode, plate.staffCode);
  if (gate.kind !== "ok") return { refuse: gate as PlateResult };
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
    return recordVisit(ctx.service, ctx.input, data.choice);
  });

/** Records today's visit and, if chosen, uses a reward (both ways of confirming end here). */
async function recordVisit(
  service: SupabaseClient,
  input: { holderId: string; memberId: string; cardId: null; deviceId: null; at: Date },
  choice: PlateChoice,
): Promise<PlateResult> {
  const store = barStore(service);
  let state = await checkInVisit(store, input);
  const milestoneRewards = state.firstToday ? (await awardMilestones(service, input.holderId, tapCardYear(input.at))).map((m) => m.rewardText) : [];
  if (choice.kind === "none") return { kind: "ok", state, milestoneRewards };
  const used = await useBarReward(store, { ...input, choice });
  state = { ...used.state, firstToday: state.firstToday, newlyEarned: state.newlyEarned };
  return { kind: "ok", state, milestoneRewards, outcome: used.outcome };
}

// ---- The staff QR (/s/<token>) ----

/** The plate's Continue: hold the customer's choice for the staff QR. */
export const choosePlateAction = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string; choice: PendingChoice }) => ({
    code: String(data?.code ?? ""),
    choice: parsePendingChoice(data?.choice) ?? ({ kind: "none" } as PendingChoice),
  }))
  .handler(async ({ data }): Promise<{ kind: "ok" } | { kind: "signed-out" } | { kind: "closed" }> => {
    const service = await getSupabaseServiceRoleClient();
    const plate = await loadPlate(service, data.code);
    if (!plate?.open) return { kind: "closed" };
    if (!(await readHolderId())) return { kind: "signed-out" };
    const saved = await setPlatePending({ memberId: plate.memberId, plateCode: normalizeCardCode(data.code)!, choice: data.choice });
    return saved ? { kind: "ok" } : { kind: "signed-out" };
  });

async function plateByStaffQr(service: SupabaseClient, token: string): Promise<Plate | null> {
  if (!isStaffQrToken(token)) return null;
  const { data, error } = await service.from("tap_card_plates").select("code").eq("staff_qr", token).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? loadPlate(service, data.code) : null;
}

export type StaffQrPage =
  | { view: "unknown" }
  | { view: "closed"; memberName: string }
  | { view: "scan-plate-first"; memberName: string }
  | { view: "wrong-brewery"; memberName: string }
  | { view: "check-in"; memberName: string; memberSlug: string; plateCode: string }
  | { view: "confirm"; memberName: string; memberSlug: string; plateCode: string; rewardText: string };

export const getStaffQrView = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) => ({ token: String(data?.token ?? "") }))
  .handler(async ({ data }): Promise<StaffQrPage> => {
    const service = await getSupabaseServiceRoleClient();
    const plate = await plateByStaffQr(service, data.token);
    if (!plate) return { view: "unknown" };
    if (!plate.open) return { view: "closed", memberName: plate.memberName };
    const holderId = await readHolderId();
    const pending = holderId ? await readPlatePending(holderId) : null;
    const decided = decideStaffQrView({ qrMemberId: plate.memberId, signedIn: holderId !== null, pending, now: new Date() });
    const { memberName, memberSlug } = plate;
    if (decided.kind === "unknown") return { view: "unknown" };
    if (decided.kind === "scan-plate-first" || decided.kind === "wrong-brewery") return { view: decided.kind, memberName };
    if (decided.kind === "check-in") return { view: "check-in", memberName, memberSlug, plateCode: decided.plateCode };
    const state = await barState(barStore(service), {
      holderId: holderId!,
      memberId: plate.memberId,
      cardId: null,
      deviceId: null,
      at: new Date(),
      firstToday: false,
      newlyEarned: [],
    });
    const wanted = decided.choice;
    const reward = [state.featured, ...state.others].find(
      (r) =>
        r !== null &&
        (wanted.kind === "trail"
          ? r.kind === "trail"
          : wanted.kind === "earn"
            ? r.kind === "earn" && r.slot === wanted.slot
            : r.kind === "member" && r.id === wanted.id),
    );
    // The reward is gone (used or expired since the plate): a plain check-in is still fine.
    if (!reward || state.used) return { view: "check-in", memberName, memberSlug, plateCode: decided.plateCode };
    return { view: "confirm", memberName, memberSlug, plateCode: decided.plateCode, rewardText: reward.reward };
  });

/** The customer confirmed on the staff QR page: record the waiting choice once. */
export const confirmByStaffQr = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; skipReward?: boolean }) => ({ token: String(data?.token ?? ""), skipReward: data?.skipReward === true }))
  .handler(async ({ data }): Promise<PlateResult | { kind: "scan-plate-first" }> => {
    const service = await getSupabaseServiceRoleClient();
    const plate = await plateByStaffQr(service, data.token);
    if (!plate?.open) return { kind: "closed" };
    const holderId = await readHolderId();
    if (!holderId) return { kind: "signed-out" };
    const pending = await readPlatePending(holderId);
    const decided = decideStaffQrView({ qrMemberId: plate.memberId, signedIn: true, pending, now: new Date() });
    if (decided.kind !== "check-in" && decided.kind !== "confirm") return { kind: "scan-plate-first" };
    if (!(await claimPlatePending(pending!))) return { kind: "scan-plate-first" };
    const choice: PlateChoice = decided.kind === "confirm" && !data.skipReward ? decided.choice : { kind: "none" };
    return recordVisit(service, { holderId, memberId: plate.memberId, cardId: null, deviceId: null, at: new Date() }, choice);
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

export type CounterPlate = { url: string; printedCode: string; staffCode: string | null; staffQrUrl: string; staffQrPrinted: string };

function counterPlate(plate: { code: string; staffCode: string | null; staffQr: string }): CounterPlate {
  const site = resolveEmailSiteUrl(currentRequestUrl());
  return { url: plateUrl(site, plate.code), printedCode: formatCardCode(plate.code), staffCode: plate.staffCode, staffQrUrl: staffQrUrl(site, plate.staffQr), staffQrPrinted: formatCardCode(plate.staffQr) };
}

export const getCounterPlate = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => ({ memberId: String(data?.memberId ?? "") }))
  .handler(async ({ data }): Promise<CounterPlate> => {
    const { service } = await requireTapCardEditor(data.memberId);
    return counterPlate(await ensurePlate(service, data.memberId));
  });

/** A copied or lost staff QR: a new one; the old one stops working at once. */
export const resetStaffQr = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => ({ memberId: String(data?.memberId ?? "") }))
  .handler(async ({ data }): Promise<CounterPlate> => {
    const { service } = await requireTapCardEditor(data.memberId);
    const current = await ensurePlate(service, data.memberId);
    const staffQr = generateCardCode();
    const { error } = await service
      .from("tap_card_plates")
      .update({ staff_qr: staffQr, updated_at: new Date().toISOString() })
      .eq("member_id", data.memberId);
    if (error) throw new Error(error.message);
    return counterPlate({ ...current, staffQr });
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
      if (!error) return counterPlate({ ...current, code });
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
