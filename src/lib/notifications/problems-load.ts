import type { SupabaseClient } from "@supabase/supabase-js";
import { GUEST_LINK_DAYS, upcomingStopsFilter, type GuestStop } from "@/lib/events/guest-links";
import type { MemberNotificationRow, MemberType } from "@/lib/supabase/types";
import { CLOSED_DAY_CONFLICT, type ClosedDayInputs, type ClosedMember } from "./closed-day";
import { UTC_CALENDAR, type UtcConnection } from "./utc-calendar";

const DAY_MS = 24 * 3600 * 1000;
/** PostgREST's default row cap: a read this long may have been cut short. */
const ROW_CAP = 1000;
const EVENT_COLUMNS =
  "id, member_id, title, venue_name, address, city, starts_at, ends_at, all_day, overlay_status, overlay_starts_at, is_hidden";

export type ProblemInputs = ClosedDayInputs & {
  connections: UtcConnection[];
  /** Only open utc_calendar rows. */
  utcOpenRows: MemberNotificationRow[];
};

function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The problem check's inputs (problems.server.ts passes the service-role
 * client): every member; closed special hours of published producers and
 * allied members from today to GUEST_LINK_DAYS ahead; live-window events
 * (kind = 'event') of any member type, with their event_hosts links in any
 * status; calendar connections; and the open problem rows. The closed-day
 * dates are read a day wide on each side (UTC) -- the decide function
 * applies each member's own time zone. Throws on a failed read.
 */
export async function loadProblemInputs(db: SupabaseClient, now: Date): Promise<ProblemInputs> {
  const { data: memberRows, error: mErr } = await db
    .from("members")
    .select("id, business_name, member_type, timezone, status");
  if (mErr) throw mErr;
  const members = new Map<string, ClosedMember>();
  for (const m of (memberRows ?? []) as Array<Record<string, string>>) {
    members.set(m.id, {
      id: m.id,
      name: m.business_name,
      type: m.member_type as MemberType,
      timezone: m.timezone,
      published: m.status === "published",
    });
  }
  const closeable = [...members.values()]
    .filter((m) => m.published && (m.type === "producer" || m.type === "allied"))
    .map((m) => m.id);

  const [hoursRes, eventsRes, connRes, openRes] = await Promise.all([
    closeable.length
      ? db
          .from("special_hours")
          .select("member_id, date, note")
          .eq("is_closed", true)
          .in("member_id", closeable)
          .gte("date", utcDate(now.getTime() - DAY_MS))
          .lte("date", utcDate(now.getTime() + (GUEST_LINK_DAYS + 1) * DAY_MS))
      : Promise.resolve({ data: [], error: null }),
    // The links come embedded (event_hosts.event_id is events' primary key,
    // so each is one object or null): no list of event ids in the URL.
    db
      .from("events")
      .select(`${EVENT_COLUMNS}, event_hosts(event_id, host_member_id)`)
      .eq("kind", "event")
      .or(upcomingStopsFilter(now)),
    db
      .from("calendar_connections")
      .select("id, member_id, purpose, feed_time_zone, feed_has_timed_events"),
    db
      .from("member_notifications")
      .select("*")
      .eq("kind", "problem")
      .eq("status", "open")
      .in("type", [CLOSED_DAY_CONFLICT, UTC_CALENDAR]),
  ]);
  for (const r of [hoursRes, eventsRes, connRes, openRes]) if (r.error) throw r.error;

  type Link = { event_id: string; host_member_id: string };
  type EventWithLink = GuestStop & { event_hosts?: Link | Link[] | null };
  const eventRows = (eventsRes.data ?? []) as EventWithLink[];
  // Fail closed: a cut-short list would resolve and reopen rows wrongly.
  if (eventRows.length >= ROW_CAP) {
    throw new Error(
      `loadProblemInputs: ${eventRows.length} events read -- the list may be cut short, so nothing is checked`,
    );
  }
  const events: GuestStop[] = [];
  const links: Link[] = [];
  for (const { event_hosts: embedded, ...e } of eventRows) {
    events.push(e);
    for (const l of [embedded ?? []].flat()) {
      links.push({ event_id: l.event_id, host_member_id: l.host_member_id });
    }
  }

  const openRows = (openRes.data ?? []) as MemberNotificationRow[];
  return {
    closedDays: (
      (hoursRes.data ?? []) as Array<{ member_id: string; date: string; note: string | null }>
    ).map((h) => ({ member_id: h.member_id, date: h.date, note: h.note ?? null })),
    members,
    events,
    links,
    openRows: openRows.filter((r) => r.type === CLOSED_DAY_CONFLICT),
    connections: (connRes.data ?? []) as UtcConnection[],
    utcOpenRows: openRows.filter((r) => r.type === UTC_CALENDAR),
  };
}
