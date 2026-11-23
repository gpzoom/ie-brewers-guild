import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { resolveEmailSiteUrl } from "@/lib/email/build-email-content";
import { currentRequestUrl } from "@/lib/request-url.server";
import { formatCardCode, generateCardCode, normalizeCardCode } from "@/lib/tap-card/card-code";
import { firstNameOf } from "@/lib/tap-card/card-view";
import { barState, checkInVisit, undoBarReward, useBarReward, type BarState, type BarStore, type RewardChoice, type VisitInput } from "@/lib/tap-card/bar-core";
import { barStore } from "@/lib/tap-card/bar-store.server";
import { awardMilestones } from "@/lib/tap-card/tap-card-store.server";
import { claimPlatePending, onStagingSite, readHolderId, readPlatePending, setPlatePending } from "@/lib/tap-card/tap-card-cookies.server";
import { decideStaffQrView, isStaffQrToken, isTrailStop, memberTakesCheckIns, parsePendingChoice, type PendingChoice } from "@/lib/tap-card/staff-qr";
import { activePinCount, ensurePlate, loadPersonalPins } from "@/lib/tap-card/plate-store.server";
import { matchPin, plateIsOn } from "@/lib/tap-card/staff-codes";
import { logTurnedOff, logVisitActivity, pinSource, sourceByQr, type Source, type VisitResult } from "@/lib/tap-card/staff-source.server";
import { requireTapCardEditor } from "@/lib/tap-card/tap-card-editor.server";
import { requireTapCardGuildAdmin } from "@/lib/tap-card/guild-admin.server";
import { tapCardDay, tapCardYear } from "@/lib/tap-card/tap-card-time";
import { canJoinTrail } from "@/lib/tap-card/trail-pass-store.server";
import { PLATE_LOCK_MINUTES, plateUrl, staffCodeGate, type AttemptStore } from "@/lib/tap-card/plate";

/**
 * Counter plate (/t/<code>): the customer's own phone, signed in to their
 * Scan Pass, checks in at a brewery with no bar device -- but nothing is
 * recorded until the staff member types the brewery's staff code. Opening the
 * page only looks.
 */

type Plate = { memberId: string; memberName: string; memberSlug: string; staffCode: string | null; staffCodeOff: boolean; takesCheckIns: boolean; open: boolean; trailStop: boolean };

async function loadPlate(service: SupabaseClient, rawCode: string): Promise<Plate | null> {
  const code = normalizeCardCode(rawCode);
  return code ? loadPlateBy(service, "code", code) : null;
}

async function loadPlateBy(service: SupabaseClient, column: "code" | "member_id", value: string): Promise<Plate | null> {
  const { data, error } = await service
    .from("tap_card_plates")
    .select("member_id, staff_code, staff_code_off, members!inner(business_name, slug, status, member_type, trail_eligible)")
    .eq(column, value)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const m = data.members as unknown as { business_name: string; slug: string; status: string; member_type: string; trail_eligible: boolean };
  // A 4-digit code turns the plate on: the shared one (even switched off) or a person's.
  const takesCheckIns = memberTakesCheckIns({ status: m.status, memberType: m.member_type, trailEligible: m.trail_eligible }, onStagingSite());
  const personalActive = takesCheckIns && data.staff_code === null ? await activePinCount(service, data.member_id) : 0;
  return {
    memberId: data.member_id,
    memberName: m.business_name,
    memberSlug: m.slug,
    staffCode: data.staff_code,
    staffCodeOff: data.staff_code_off === true,
    trailStop: isTrailStop({ memberType: m.member_type, trailEligible: m.trail_eligible === true }),
    takesCheckIns,
    open: takesCheckIns && plateIsOn({ shared: data.staff_code, personalActive }),
  };
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
  | { kind: "turned-off" }
  | { kind: "closed" };
type PlateOkResult = Extract<PlateResult, { kind: "ok" }>;

/** Holder + plate + a checked staff code, or the reason to refuse. */
async function plateContext(rawCode: string, staffCode: string) {
  const service = await getSupabaseServiceRoleClient();
  const plate = await loadPlate(service, rawCode);
  if (!plate?.open) return { refuse: { kind: "closed" } as PlateResult };
  const holderId = await readHolderId();
  if (!holderId) return { refuse: { kind: "signed-out" } as PlateResult };
  const personal = await loadPersonalPins(service, plate.memberId);
  const gate = await staffCodeGate(attemptStore(service, holderId, plate.memberId), () =>
    pinSource(matchPin(staffCode, { shared: plate.staffCode, sharedOff: plate.staffCodeOff, personal })),
  );
  if (gate.kind !== "ok") return { refuse: gate as PlateResult };
  return { service, source: gate.match, input: { holderId, memberId: plate.memberId, cardId: null, deviceId: null, at: new Date() } };
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
    return recordVisit(ctx.service, ctx.input, data.choice, ctx.source);
  });

/** Records today's visit and, if chosen, uses a reward (both ways of confirming end here). */
async function recordVisit(
  service: SupabaseClient,
  input: { holderId: string; memberId: string; cardId: null; deviceId: null; at: Date },
  choice: PlateChoice,
  source: Source,
): Promise<PlateResult> {
  const store = barStore(service);
  const checkedIn = await checkInVisit(store, input);
  let logged: VisitResult = { state: checkedIn };
  try {
    const result = await finishVisit(service, store, input, choice, checkedIn);
    logged = result;
    return result;
  } finally {
    // Even when the rest fails, the check-in happened, so it's in the log.
    await logVisitActivity(service, store, input, null, logged, source);
  }
}

/** After the check-in: milestones, then the chosen reward. */
async function finishVisit(
  service: SupabaseClient,
  store: BarStore,
  input: VisitInput,
  choice: PlateChoice,
  checkedIn: BarState,
): Promise<PlateOkResult> {
  let state = checkedIn;
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

/** The plate a staff QR belongs to, and whose code it is (working or turned off). */
async function plateByStaffQr(service: SupabaseClient, token: string): Promise<{ plate: Plate; qr: { active: boolean; source: Source } } | null> {
  if (!isStaffQrToken(token)) return null;
  const qr = await sourceByQr(service, token);
  const plate = qr && (await loadPlateBy(service, "member_id", qr.memberId));
  return plate ? { plate, qr } : null;
}

export type StaffQrPage =
  | { view: "unknown" }
  | { view: "closed"; memberName: string }
  | { view: "turned-off"; memberName: string }
  | { view: "scan-plate-first"; memberName: string }
  | { view: "wrong-brewery"; memberName: string }
  | { view: "check-in"; memberName: string; memberSlug: string; plateCode: string }
  | { view: "confirm"; memberName: string; memberSlug: string; plateCode: string; rewardText: string };

export const getStaffQrView = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) => ({ token: String(data?.token ?? "") }))
  .handler(async ({ data }): Promise<StaffQrPage> => {
    const service = await getSupabaseServiceRoleClient();
    const found = await plateByStaffQr(service, data.token);
    if (!found) return { view: "unknown" };
    const { plate, qr } = found;
    const holderId = await readHolderId();
    const pending = holderId ? await readPlatePending(holderId) : null;
    const decided = decideStaffQrView({
      qrMemberId: plate.memberId,
      takesCheckIns: plate.takesCheckIns,
      plateOpen: plate.open,
      qrActive: qr.active,
      signedIn: holderId !== null,
      pending,
      now: new Date(),
    });
    const { memberName, memberSlug } = plate;
    if (decided.kind === "unknown") return { view: "unknown" };
    if (decided.kind === "closed") return { view: "closed", memberName };
    if (decided.kind === "turned-off") {
      if (holderId) await logTurnedOff(service, { holderId, memberId: plate.memberId, token: data.token, source: qr.source, at: new Date() });
      return { view: "turned-off", memberName };
    }
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
    const found = await plateByStaffQr(service, data.token);
    if (!found) return { kind: "closed" };
    const { plate, qr } = found;
    const holderId = await readHolderId();
    const pending = holderId ? await readPlatePending(holderId) : null;
    const decided = decideStaffQrView({
      qrMemberId: plate.memberId,
      takesCheckIns: plate.takesCheckIns,
      plateOpen: plate.open,
      qrActive: qr.active,
      signedIn: holderId !== null,
      pending,
      now: new Date(),
    });
    if (decided.kind === "closed") return { kind: "closed" };
    if (decided.kind === "turned-off") {
      if (holderId) await logTurnedOff(service, { holderId, memberId: plate.memberId, token: data.token, source: qr.source, at: new Date() });
      return { kind: "turned-off" };
    }
    if (!holderId) return { kind: "signed-out" };
    if (decided.kind !== "check-in" && decided.kind !== "confirm") return { kind: "scan-plate-first" };
    if (!(await claimPlatePending(pending!))) return { kind: "scan-plate-first" };
    const choice: PlateChoice = decided.kind === "confirm" && !data.skipReward ? decided.choice : { kind: "none" };
    return recordVisit(service, { holderId, memberId: plate.memberId, cardId: null, deviceId: null, at: new Date() }, choice, qr.source);
  });

/** The reward about to be undone, for the activity log only: a failed read doesn't stop the undo. */
async function rewardInUse(store: BarStore, input: VisitInput): Promise<BarState["used"]> {
  try {
    return (await barState(store, { ...input, firstToday: false, newlyEarned: [] })).used;
  } catch (error) {
    console.error("Scan Pass activity: couldn't read the reward", error);
    return null;
  }
}

export const undoAtPlate = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string; staffCode: string }) => ({ code: String(data?.code ?? ""), staffCode: String(data?.staffCode ?? "") }))
  .handler(async ({ data }): Promise<PlateResult> => {
    const ctx = await plateContext(data.code, data.staffCode);
    if ("refuse" in ctx) return ctx.refuse!;
    const store = barStore(ctx.service);
    const before = await rewardInUse(store, ctx.input);
    const { outcome, state } = await undoBarReward(store, ctx.input);
    await logVisitActivity(ctx.service, store, ctx.input, before, { state, outcome }, ctx.source);
    return { kind: "ok", state, milestoneRewards: [], outcome };
  });

// ---- The brewery's Counter plate box (Portal/Admin > Scan Pass) ----

/** No staff QR and no 4-digit code: full editors see this box. Those are in staff-codes.server.ts. */
export type CounterPlate = { url: string; printedCode: string; plateOn: boolean };

async function counterPlate(service: SupabaseClient, memberId: string, plate: { code: string; staffCode: string | null }): Promise<CounterPlate> {
  const site = resolveEmailSiteUrl(currentRequestUrl());
  const plateOn = plateIsOn({ shared: plate.staffCode, personalActive: await activePinCount(service, memberId) });
  return { url: plateUrl(site, plate.code), printedCode: formatCardCode(plate.code), plateOn };
}

export const getCounterPlate = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => ({ memberId: String(data?.memberId ?? "") }))
  .handler(async ({ data }): Promise<CounterPlate> => {
    const { service } = await requireTapCardEditor(data.memberId);
    return counterPlate(service, data.memberId, await ensurePlate(service, data.memberId));
  });

/** A lost or stolen plate: a new link; the old plate stops working. The staff codes stay. */
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
      if (!error) return counterPlate(service, data.memberId, { ...current, code });
      if (error.code !== "23505") throw new Error(error.message);
    }
    throw new Error("Couldn't make a new plate link. Try again.");
  });

/** Guild > Scan Pass > Cards: every trail stop's plate link, for the printer (plates are made as needed). */
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
  return { filename: "scan-pass-counter-plates.csv", csv: rows.join("\n") + "\n" };
});
