import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toSpecialHoursDay, toWeekdayHours } from "@/lib/hours/hours-rows";
import type { HoursRow, SpecialHoursRow } from "@/lib/supabase/types";
import { dbFailed, readAllRows } from "@/lib/tap-card/plate-store.server";
import { customerLabels, type ActivityRow, type MemberHours } from "@/lib/tap-card/staff-activity";
import {
  buildPage,
  buildSummary,
  countBeforeTracking,
  parseRange,
  rangeStart,
  type ActivityItem,
  type ActivityRange,
  type ActivitySummary,
} from "@/lib/tap-card/staff-activity-view";
import { requireTapCardOwner } from "@/lib/tap-card/tap-card-editor.server";

export type { ActivityItem, ActivityRange, ActivitySummary } from "@/lib/tap-card/staff-activity-view";

/**
 * Portal/Admin > Scan Pass > Staff activity (spec 2026-11-23): owners,
 * co-owners and Guild admins only. Customers are anonymous labels; no
 * customer id, visit id or code text is returned.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TZ = "America/Los_Angeles";

type ActivityDbRow = {
  id: string;
  holder_id: string;
  at: string;
  event: ActivityRow["event"];
  source: ActivityRow["source"];
  staff_id: string | null;
  method: "qr" | "pin" | null;
  reward: string | null;
};

async function loadHours(service: SupabaseClient, memberId: string): Promise<MemberHours> {
  const [member, hours, special] = await Promise.all([
    service.from("members").select("timezone").eq("id", memberId).maybeSingle(),
    readAllRows<Omit<HoursRow, "id" | "member_id">>((from, to) =>
      service.from("hours").select("weekday, opens_at, closes_at, closes_next_day, is_closed").eq("member_id", memberId).order("weekday").order("id").range(from, to),
    ),
    readAllRows<Omit<SpecialHoursRow, "id" | "member_id">>((from, to) =>
      service
        .from("special_hours")
        .select("date, is_closed, opens_at, closes_at, closes_next_day, note")
        .eq("member_id", memberId)
        .order("date")
        .order("id")
        .range(from, to),
    ),
  ]);
  if (member.error) throw dbFailed(member.error);
  const timezone = member.data?.timezone || DEFAULT_TZ;
  // No weekly hours posted: nothing is ever "outside hours", special days included.
  if (hours.length === 0) return { timezone, hours: [], specialHours: [] };
  return { timezone, hours: toWeekdayHours(hours as HoursRow[]), specialHours: toSpecialHoursDay(special as SpecialHoursRow[]) };
}

/** The member's activity and wrong tries in range, with anonymous customer labels over both. */
async function loadActivity(service: SupabaseClient, memberId: string, start: string | null) {
  const [activity, missRows] = await Promise.all([
    readAllRows<ActivityDbRow>((from, to) => {
      let query = service
        .from("tap_card_staff_activity")
        .select("id, holder_id, at, event, source, staff_id, method, reward")
        .eq("member_id", memberId);
      if (start) query = query.gte("at", start);
      return query.order("at").order("id").range(from, to);
    }),
    readAllRows<{ holder_id: string; missed_at: string }>((from, to) => {
      let query = service.from("tap_card_plate_misses").select("holder_id, missed_at").eq("member_id", memberId);
      if (start) query = query.gte("missed_at", start);
      return query.order("missed_at").order("id").range(from, to);
    }),
  ]);
  const rows: ActivityRow[] = activity.map((r) => ({
    id: r.id,
    holderId: r.holder_id,
    visitId: null,
    at: r.at,
    event: r.event,
    source: r.source,
    staffId: r.staff_id,
    method: r.method === "pin" ? "pin" : "qr",
    reward: r.reward,
  }));
  const misses = missRows.map((m) => ({ holderId: m.holder_id, at: m.missed_at }));
  const labels = await customerLabels(memberId, [...rows.map((r) => r.holderId), ...misses.map((m) => m.holderId)]);
  return { rows, misses, labels };
}

/** Visits in range that no activity row points at. Ids only, paged; no big lists in a filter. */
async function countVisitsBeforeTracking(service: SupabaseClient, memberId: string, start: string | null): Promise<number> {
  const visits = await readAllRows<{ id: string }>((from, to) => {
    let query = service.from("tap_card_visits").select("id").eq("member_id", memberId);
    if (start) query = query.gte("visited_at", start);
    return query.order("visited_at").order("id").range(from, to);
  });
  if (visits.length === 0) return 0;
  // The row for a visit is logged at or just after it; a day's margin keeps a visit at the range edge honest.
  const activityStart = start ? new Date(Date.parse(start) - DAY_MS).toISOString() : null;
  const logged = await readAllRows<{ visit_id: string | null }>((from, to) => {
    let query = service.from("tap_card_staff_activity").select("visit_id").eq("member_id", memberId).not("visit_id", "is", null);
    if (activityStart) query = query.gte("at", activityStart);
    return query.order("at").order("id").range(from, to);
  });
  return countBeforeTracking(
    visits.map((v) => v.id),
    logged.map((l) => l.visit_id),
  );
}

export const getStaffActivity = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string; range: ActivityRange }) => ({
    memberId: String(data?.memberId ?? ""),
    range: parseRange(data?.range),
  }))
  .handler(async ({ data }): Promise<ActivitySummary> => {
    const { service } = await requireTapCardOwner(data.memberId);
    const start = rangeStart(data.range, new Date());
    const [hours, staff, { rows, misses, labels }, beforeTracking] = await Promise.all([
      loadHours(service, data.memberId),
      readAllRows<{ id: string; name: string; removed_at: string | null }>((from, to) =>
        service.from("tap_card_staff").select("id, name, removed_at").eq("member_id", data.memberId).order("created_at").order("id").range(from, to),
      ),
      loadActivity(service, data.memberId, start),
      countVisitsBeforeTracking(service, data.memberId, start),
    ]);
    return buildSummary({
      rows,
      hours,
      staff: staff.map((p) => ({ id: p.id, name: p.name, removed: p.removed_at !== null })),
      labels,
      misses,
      beforeTracking,
    });
  });

export const getStaffActivityList = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string; range: ActivityRange; key: string; offset: number }) => ({
    memberId: String(data?.memberId ?? ""),
    range: parseRange(data?.range),
    key: String(data?.key ?? ""),
    offset: Number(data?.offset),
  }))
  .handler(async ({ data }): Promise<{ items: ActivityItem[]; more: boolean }> => {
    const { service } = await requireTapCardOwner(data.memberId);
    const start = rangeStart(data.range, new Date());
    const [hours, { rows, labels }] = await Promise.all([loadHours(service, data.memberId), loadActivity(service, data.memberId, start)]);
    return buildPage({ rows, hours, labels, key: data.key, offset: data.offset });
  });
