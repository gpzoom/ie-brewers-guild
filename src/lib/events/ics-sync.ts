import ICAL from "ical.js";

export type ParsedIcsEvent = {
  externalEventId: string;
  startsAt: string;
  endsAt: string | null;
  summary: string;
};

/**
 * Sync is tag-based opt-in (spec, "Events"): only events whose title or
 * category contains the member's chosen sync_tag are imported, since most
 * calendars contain private entries pulling everything would publish.
 *
 * LIMITATION -- recurring events (an `RRULE` on the VEVENT, e.g. a weekly
 * Thursday trivia night) are read via `ICAL.Event#startDate`/`endDate`,
 * which only ever reflects the FIRST occurrence in the recurrence series.
 * This function does not expand recurrences, so a recurring event syncs
 * once as a single, non-advancing occurrence: its date will not move
 * forward on subsequent re-syncs as time passes and later occurrences
 * become "next up". This mirrors the hand-entry events feature's existing
 * single-occurrence-only scope and is a deliberate v1 boundary, not an
 * oversight -- callers (calendar-connection.server.ts, ics-refresh-cron.server.ts)
 * should be aware a synced recurring event will effectively go stale after
 * its first occurrence passes, until/unless RRULE expansion is added.
 */
export function parseIcsFeedForTag(icsText: string, syncTag: string): ParsedIcsEvent[] {
  const jcalData = ICAL.parse(icsText);
  const component = new ICAL.Component(jcalData);
  const vevents = component.getAllSubcomponents("vevent");
  const needle = syncTag.trim().toLowerCase();

  return vevents
    .map((vevent) => new ICAL.Event(vevent))
    .filter((event) => {
      const summary = (event.summary ?? "").toLowerCase();
      const categoriesProp = event.component.getFirstProperty("categories");
      const categories: string[] = categoriesProp
        ? (categoriesProp.getValues() as string[]).map((c) => c.toLowerCase())
        : [];
      return summary.includes(needle) || categories.some((category) => category.includes(needle));
    })
    .map((event) => ({
      externalEventId: event.uid,
      startsAt: event.startDate.toJSDate().toISOString(),
      endsAt: event.endDate ? event.endDate.toJSDate().toISOString() : null,
      summary: event.summary ?? "",
    }));
}

export type EventUpsertRow = {
  member_id: string;
  calendar_connection_id: string;
  source: "ics";
  external_event_id: string;
  starts_at: string;
  ends_at: string | null;
};

/**
 * Builds exactly the columns a re-sync is allowed to write. Deliberately
 * excludes overlay_status/overlay_starts_at/overlay_note/overlay_set_at --
 * a re-sync must reconcile on (calendar_connection_id, external_event_id)
 * and never touch those columns (spec, "Events": "A re-sync must reconcile
 * by event id and preserve the overlay"). This is the single reason the
 * overlay lives in this table, so getting it wrong here is expensive.
 */
export function buildEventUpsertRows(
  memberId: string,
  calendarConnectionId: string,
  parsedEvents: ParsedIcsEvent[],
): EventUpsertRow[] {
  return parsedEvents.map((event) => ({
    member_id: memberId,
    calendar_connection_id: calendarConnectionId,
    source: "ics" as const,
    external_event_id: event.externalEventId,
    starts_at: event.startsAt,
    ends_at: event.endsAt,
  }));
}
