import type { MemberNotificationRow } from "@/lib/supabase/types";
import type { ProblemOpen } from "./closed-day";
import { rowFields, typeDef } from "./registry";
import type { UtcCalendarDetails } from "./types";

/**
 * A Google Calendar feed whose X-WR-TIMEZONE is UTC makes event times show
 * 7-8 hours early. We detect it; we never convert times. Pure: the server
 * wrapper loads the inputs and writes the result.
 */
export const UTC_CALENDAR = "utc_calendar";

const UTC_ZONES = new Set(["utc", "gmt", "etc/utc", "etc/gmt", "etc/uct", "uct", "zulu"]);

export function isUtcZone(tz: string | null): boolean {
  return tz !== null && UTC_ZONES.has(tz.trim().toLowerCase());
}

/** The feed's X-WR-TIMEZONE value, or null when the header is absent. */
export function feedTimeZone(icsText: string): string | null {
  // A CRLF (or LF) followed by a space or tab continues the previous line.
  const unfolded = icsText.replace(/\r?\n[ \t]/g, "");
  const match = /^X-WR-TIMEZONE(?:;[^:\r\n]*)?:(.*)$/im.exec(unfolded);
  const value = match?.[1].trim();
  return value ? value : null;
}

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
    if (!isUtcZone(c.feed_time_zone) || isUtcZone(member.timezone)) continue;
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
