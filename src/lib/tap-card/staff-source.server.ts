import type { SupabaseClient } from "@supabase/supabase-js";
import type { BarState, BarStore, VisitInput } from "@/lib/tap-card/bar-core";
import type { BarReward } from "@/lib/tap-card/loyalty";
import { dbFailed } from "@/lib/tap-card/plate-store.server";
import { loadMemberHours } from "@/lib/tap-card/member-hours.server";
import { visitFlag, type ActivityRow, type MemberHours, type VisitFlag } from "@/lib/tap-card/staff-activity";
import type { PinMatch } from "@/lib/tap-card/staff-codes";
import type { LocationWord } from "@/lib/tap-card/location";
import { TAP_CARD_TZ, tapCardDay } from "@/lib/tap-card/tap-card-time";

/**
 * Which staff code confirmed a visit, and the activity log (spec 2026-11-23
 * staff QR tracking). Logging never stops a customer's check-in. No
 * createServerFn here; client code must never import it.
 */

export type Source =
  | { source: "staff"; staffId: string; codeId: string; method: "qr" | "pin"; codeText: string | null }
  | { source: "counter"; method: "qr"; codeText: string }
  | { source: "staff-code"; method: "pin" };

/** Whose QR this is and whether it works now; null when it's not known. */
export async function sourceByQr(service: SupabaseClient, token: string): Promise<{ memberId: string; active: boolean; source: Source } | null> {
  const { data: row, error } = await service
    .from("tap_card_staff_codes")
    .select("id, member_id, staff_id, turned_off_at")
    .eq("kind", "qr")
    .eq("code", token)
    .maybeSingle();
  if (error) throw dbFailed(error);
  if (row?.staff_id) {
    const person = await service.from("tap_card_staff").select("removed_at").eq("id", row.staff_id).maybeSingle();
    if (person.error) throw dbFailed(person.error);
    return {
      memberId: row.member_id,
      active: row.turned_off_at === null && person.data !== null && person.data.removed_at === null,
      source: { source: "staff", staffId: row.staff_id, codeId: row.id, method: "qr", codeText: token },
    };
  }
  // The plate decides first: a counter reset that failed halfway leaves the
  // working token also on record as turned off.
  const plate = await service.from("tap_card_plates").select("member_id").eq("staff_qr", token).maybeSingle();
  if (plate.error) throw dbFailed(plate.error);
  const source: Source = { source: "counter", method: "qr", codeText: token };
  if (plate.data) return { memberId: plate.data.member_id, active: true, source };
  return row ? { memberId: row.member_id, active: false, source } : null;
}

/** The source for a typed 4-digit code; its text is never kept. */
export function pinSource(match: PinMatch): Source | null {
  if (!match) return null;
  return match.source === "staff"
    ? { source: "staff", staffId: match.staffId, codeId: match.codeId, method: "pin", codeText: null }
    : { source: "staff-code", method: "pin" };
}

type ActivityEvent = {
  event: "check-in" | "reward-used" | "reward-undone" | "turned-off-code";
  source: Source["source"];
  staff_id: string | null;
  code_id: string | null;
  method: "qr" | "pin";
  code_text: string | null;
  reward: string | null;
};
export type ActivityInsert = ActivityEvent & { location?: LocationWord | null; member_id: string; holder_id: string; visit_id: string | null; at: string; day: string };

function eventFrom(source: Source, event: ActivityEvent["event"], reward: string | null = null): ActivityEvent {
  return {
    event,
    source: source.source,
    staff_id: source.source === "staff" ? source.staffId : null,
    code_id: source.source === "staff" ? source.codeId : null,
    method: source.method,
    // QR text only: a 4-digit code is never recorded.
    code_text: source.method === "qr" ? source.codeText : null,
    reward,
  };
}

export type VisitResult = {
  state: Pick<BarState, "firstToday" | "used">;
  outcome?: "used" | "already-used-today" | "not-available" | "undone" | "nothing-to-undo";
};

/** What a confirm or an undo adds to the log. `before` is the reward in use before an undo. */
export function activityFor(before: BarReward | null, result: VisitResult, source: Source): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  if (result.state.firstToday) events.push(eventFrom(source, "check-in"));
  if (result.outcome === "used") events.push(eventFrom(source, "reward-used", result.state.used?.reward ?? null));
  if (result.outcome === "undone") events.push(eventFrom(source, "reward-undone", before?.reward ?? null));
  return events;
}

/** Never throws: a failure only goes to the server log. */
export async function logActivity(service: SupabaseClient, rows: ActivityInsert[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const { error } = await service.from("tap_card_staff_activity").insert(rows);
    // 23505: this customer's turned-off code is already in today's log.
    if (error && error.code !== "23505") console.error("Scan Pass activity: not saved", error.message);
  } catch (error) {
    console.error("Scan Pass activity: not saved", error);
  }
}

/** Logs a finished confirm or undo. Never throws. */
export async function logVisitActivity(
  service: SupabaseClient,
  store: Pick<BarStore, "findVisit">,
  input: VisitInput,
  before: BarReward | null,
  result: VisitResult,
  source: Source,
  location: LocationWord | null = null,
): Promise<void> {
  const events = activityFor(before, result, source);
  if (events.length === 0) return;
  const day = tapCardDay(input.at);
  let visitId: string | null = null;
  try {
    visitId = (await store.findVisit(input.holderId, input.memberId, day))?.id ?? null;
  } catch (error) {
    console.error("Scan Pass activity: couldn't read the visit", error);
  }
  await logActivity(
    service,
    events.map((e) => ({ ...e, location: e.event === "reward-undone" ? null : location, member_id: input.memberId, holder_id: input.holderId, visit_id: visitId, at: input.at.toISOString(), day })),
  );
}

/**
 * Which dot this visit gets, if any: what's just been done (`now`, null when
 * nothing new was recorded) plus what today's log already has. Never throws.
 */
export async function visitFlagColor(
  service: SupabaseClient,
  store: Pick<BarStore, "findVisit">,
  input: VisitInput,
  now: { location: LocationWord | null } | null,
): Promise<VisitFlag | null> {
  const events: Pick<ActivityRow, "at" | "location">[] = now ? [{ at: input.at.toISOString(), location: now.location }] : [];
  let hours: MemberHours = { timezone: TAP_CARD_TZ, hours: [], specialHours: [] };
  const [logged, posted] = await Promise.allSettled([
    loggedToday(service, store, input),
    loadMemberHours(service, input.memberId),
  ]);
  if (logged.status === "fulfilled") events.push(...logged.value);
  else console.error("Scan Pass flag: couldn't read the log", logged.reason);
  if (posted.status === "fulfilled") hours = posted.value;
  else console.error("Scan Pass flag: couldn't read the hours", posted.reason);
  return visitFlag(events, hours);
}

async function loggedToday(service: SupabaseClient, store: Pick<BarStore, "findVisit">, input: VisitInput): Promise<Pick<ActivityRow, "at" | "location">[]> {
  const visit = await store.findVisit(input.holderId, input.memberId, tapCardDay(input.at));
  if (!visit) return [];
  const { data, error } = await service
    .from("tap_card_staff_activity")
    .select("at, location")
    .eq("visit_id", visit.id)
    .in("event", ["check-in", "reward-used"]);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * When today's reward was used, for the confirmation screen. A loyalty reward
 * keeps its own time; the Beer Trail offer's is in the activity log. Never
 * throws: null just leaves the time off.
 */
export async function rewardUsedAt(service: SupabaseClient, store: Pick<BarStore, "findVisit">, input: VisitInput): Promise<string | null> {
  try {
    const visit = await store.findVisit(input.holderId, input.memberId, tapCardDay(input.at));
    if (!visit) return null;
    const loyalty = await service.from("tap_card_earned_rewards").select("used_at").eq("used_visit_id", visit.id).maybeSingle();
    if (loyalty.error) throw new Error(loyalty.error.message);
    if (loyalty.data) return loyalty.data.used_at;
    const logged = await service
      .from("tap_card_staff_activity")
      .select("at")
      .eq("visit_id", visit.id)
      .eq("event", "reward-used")
      .order("at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (logged.error) throw new Error(logged.error.message);
    return logged.data?.at ?? null;
  } catch (error) {
    console.error("Scan Pass: couldn't read when the reward was used", error);
    return null;
  }
}

/** A signed-in customer scanned a turned-off QR: once per customer, code and day. Never throws. */
export async function logTurnedOff(
  service: SupabaseClient,
  i: { holderId: string; memberId: string; token: string; source: Source; at: Date },
): Promise<void> {
  try {
    const { data: holder, error } = await service.from("tap_card_holders").select("id").eq("id", i.holderId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!holder) return; // an old cookie for a deleted pass
  } catch (error) {
    console.error("Scan Pass activity: couldn't read the customer", error);
    return;
  }
  await logActivity(service, [
    {
      ...eventFrom(i.source, "turned-off-code"),
      code_text: i.token,
      member_id: i.memberId,
      holder_id: i.holderId,
      visit_id: null,
      at: i.at.toISOString(),
      day: tapCardDay(i.at),
    },
  ]);
}
