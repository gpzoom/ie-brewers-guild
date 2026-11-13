import { inWindow, isLive, startOf, type GuestStop } from "@/lib/events/guest-links";
import type { MemberNotificationRow, MemberType } from "@/lib/supabase/types";
import { rowFields, typeDef } from "./registry";
import type { ClosedDayConflictDetails } from "./types";

/**
 * Closed-day conflicts (docs/superpowers/specs/2026-11-13-member-alerts-design.md,
 * "What counts as closed, and as a conflict" and "Clearing"). Pure: the
 * server wrapper loads the inputs and writes the result.
 */
export const CLOSED_DAY_CONFLICT = "closed_day_conflict";

export type ClosedMember = {
  id: string;
  name: string;
  type: MemberType;
  timezone: string;
  published: boolean;
};

export type ClosedDayInputs = {
  /** Special hours rows with is_closed = true. */
  closedDays: Array<{ member_id: string; date: string; note: string | null }>;
  members: Map<string, ClosedMember>;
  /** Events (kind = 'event') starting, or rescheduled to start, in the window. */
  events: GuestStop[];
  /** event_hosts rows, whatever their status. */
  links: Array<{ event_id: string; host_member_id: string }>;
  /** Only open closed_day_conflict rows. */
  openRows: MemberNotificationRow[];
};

export type ProblemOpen<D = ClosedDayConflictDetails> = {
  type: string;
  member_id: string;
  dedupe_key: string;
  details: D;
  event_id: string | null;
  due_date: string | null;
} & ReturnType<typeof rowFields>;

export type ClosedDayDecision = { opens: ProblemOpen[]; resolveRows: MemberNotificationRow[] };

/** The YYYY-MM-DD calendar date of an instant in a time zone. */
export function localDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** Only published producers and allied (Affiliate) members can be closed; Mobile members never. */
function canBeClosed(m: ClosedMember | undefined): m is ClosedMember {
  return !!m && m.published && (m.type === "producer" || m.type === "allied");
}

export function conflictKey(memberId: string, eventId: string, date: string): string {
  return `${CLOSED_DAY_CONFLICT}:${memberId}:${eventId}:${date}`;
}

export function decideClosedDayProblems(i: ClosedDayInputs, now: Date): ClosedDayDecision {
  const fields = rowFields(typeDef(CLOSED_DAY_CONFLICT));
  const live = i.events.filter((e) => isLive(e) && inWindow(e, now));
  const hostsOf = new Map<string, Set<string>>();
  for (const l of i.links) {
    const set = hostsOf.get(l.event_id) ?? new Set<string>();
    set.add(l.host_member_id);
    hostsOf.set(l.event_id, set);
  }

  const wanted: ProblemOpen[] = [];
  const seen = new Set<string>();
  const add = (
    memberId: string,
    role: ClosedDayConflictDetails["role"],
    other: string | null,
    eventId: string,
    date: string,
    note: string | null,
  ) => {
    const key = conflictKey(memberId, eventId, date);
    if (seen.has(key)) return;
    seen.add(key);
    wanted.push({
      type: CLOSED_DAY_CONFLICT,
      member_id: memberId,
      dedupe_key: key,
      event_id: eventId,
      due_date: date,
      details: {
        role,
        event_id: eventId,
        other_member_id: other,
        closed_date: date,
        closed_note: note,
      },
      ...fields,
    });
  };

  for (const day of i.closedDays) {
    const member = i.members.get(day.member_id);
    if (!canBeClosed(member)) continue;
    // A closed day already behind us (in the member's own time zone) is over.
    if (day.date < localDate(now.getTime(), member.timezone)) continue;
    for (const e of live) {
      if (localDate(startOf(e), member.timezone) !== day.date) continue;
      if (e.member_id === member.id) {
        add(member.id, "own", null, e.id, day.date, day.note);
      } else if (hostsOf.get(e.id)?.has(member.id)) {
        add(member.id, "host", e.member_id, e.id, day.date, day.note);
        add(e.member_id, "guest", member.id, e.id, day.date, day.note);
      }
    }
  }

  // A row whose event was deleted (event_id set null) always resolves.
  const stays = (r: MemberNotificationRow) =>
    r.event_id !== null && r.dedupe_key !== null && seen.has(r.dedupe_key);
  const kept = new Set(i.openRows.filter(stays).map((r) => r.dedupe_key));
  return {
    opens: wanted.filter((o) => !kept.has(o.dedupe_key)),
    resolveRows: i.openRows.filter((r) => !stays(r)),
  };
}
