import type { MemberNotificationRow } from "@/lib/supabase/types";
import type { ProblemOpen } from "./closed-day";
import { rowFields, typeDef } from "./registry";
import type { UtcCalendarDetails } from "./types";
import { feedTimeZone, isUtcName, isWrongTimeZone } from "@/lib/events/calendar-time-zone";

export { feedTimeZone };

/**
 * A Google Calendar feed whose X-WR-TIMEZONE is anything but Pacific Time
 * (the type keeps its first name, utc_calendar). Its times are converted for
 * now (calendar-time-zone.ts); this alert asks the member to fix the setting.
 * Pure: the server wrapper loads the inputs and writes the result.
 */
export const UTC_CALENDAR = "utc_calendar";

export const isUtcZone = isUtcName;

export type UtcConnection = {
  id: string;
  member_id: string;
  purpose: "events" | "food";
  feed_time_zone: string | null;
  feed_has_timed_events: boolean | null;
};

export type UtcInputs = {
  connections: UtcConnection[];
  members: Map<string, { timezone: string; published: boolean }>;
  /** Only open utc_calendar rows. */
  openRows: MemberNotificationRow[];
};

export function utcKey(memberId: string, connectionId: string): string {
  return `${UTC_CALENDAR}:${memberId}:${connectionId}`;
}

export function decideUtcProblems(i: UtcInputs): {
  opens: ProblemOpen<UtcCalendarDetails>[];
  resolveRows: MemberNotificationRow[];
} {
  const fields = rowFields(typeDef(UTC_CALENDAR));
  const wanted = new Map<string, ProblemOpen<UtcCalendarDetails>>();
  for (const c of i.connections) {
    const member = i.members.get(c.member_id);
    if (!member || !member.published) continue;
    if (!isWrongTimeZone(c.feed_time_zone)) continue;
    if (c.feed_has_timed_events !== true) continue;
    const key = utcKey(c.member_id, c.id);
    wanted.set(key, {
      type: UTC_CALENDAR,
      member_id: c.member_id,
      dedupe_key: key,
      event_id: null,
      due_date: null,
      details: {
        calendar_connection_id: c.id,
        purpose: c.purpose,
        feed_time_zone: c.feed_time_zone as string,
      },
      ...fields,
    });
  }
  const open = new Set(i.openRows.map((r) => r.dedupe_key));
  return {
    opens: [...wanted.values()].filter((o) => !open.has(o.dedupe_key)),
    resolveRows: i.openRows.filter((r) => r.dedupe_key === null || !wanted.has(r.dedupe_key)),
  };
}
