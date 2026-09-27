import ICAL from "ical.js";

export type ParsedIcsEvent = {
  externalEventId: string;
  startsAt: string;
  endsAt: string | null;
  summary: string;
  /** The title as shown on the profile: the summary with the sync tag taken out; null if nothing is left. */
  title: string | null;
  /** The event's LOCATION, trimmed; null when it has none. */
  location: string | null;
};

const TITLE_MAX = 200;
const LOCATION_MAX = 300;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The event's title without the sync tag, so "Trivia night #guild" shows as
 * "Trivia night". Takes the tag out with or without its "#", and with any
 * brackets around it ("[guild]", "(#guild)"); tidies the spaces and stray
 * separators left behind. Null when nothing is left (the title was only the tag).
 */
export function stripSyncTag(summary: string, syncTag: string): string | null {
  const bare = syncTag.trim().replace(/^#+/, "");
  let title = summary;
  if (bare) {
    const tag = new RegExp(`[\\[(]?\\s*#?${escapeRegExp(bare)}\\s*[\\])]?`, "gi");
    title = title.replace(tag, " ");
  }
  title = title
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—|:·,]+|[\s\-–—|:·,]+$/g, "")
    .trim();
  return title ? title.slice(0, TITLE_MAX) : null;
}

/**
 * The venue from an event's LOCATION: its first part, since calendars write
 * "Hop House, 123 Main St, Riverside, CA 92501, USA". The whole location is
 * kept as the address.
 */
export function venueFromLocation(location: string | null): string | null {
  if (!location) return null;
  const first = location.split(",")[0]?.trim() ?? "";
  return first ? first.slice(0, TITLE_MAX) : null;
}

/**
 * Sync is tag-based opt-in (spec, "Events"): only events whose title,
 * description or category contains the member's chosen sync_tag are
 * imported, since most calendars contain private entries pulling everything
 * would publish. The description counts because Google Calendar has no
 * categories and a tag in the description keeps the title clean.
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
 *
 * This parses untrusted, member-controlled external calendar feeds, so it
 * fails closed/skips defensively rather than trusting the feed to be
 * well-formed:
 *  - A blank/whitespace-only sync tag returns no events. `calendar_
 *    connections.sync_tag` is a nullable, unconstrained column, so an
 *    unset tag is a realistic state; matching an empty needle against
 *    every summary/category would import a member's entire personal
 *    calendar -- exactly the privacy failure tag-based opt-in exists to
 *    prevent (see the module doc above).
 *  - A VEVENT with no resolvable `DTSTART` is skipped rather than thrown
 *    on. `event.startDate` is `null` when DTSTART is missing entirely,
 *    and one bad entry from a messy real-world calendar must not sink the
 *    whole batch (the rest of the feed should still sync).
 *  - A VEVENT with no `UID` is skipped. Without a stable external id it
 *    can't be tracked via `unique(calendar_connection_id,
 *    external_event_id)`; since Postgres never treats NULL = NULL for
 *    uniqueness, letting it through with a null id would insert a new
 *    duplicate row on every re-sync instead of ever reconciling.
 *  - A VEVENT whose `DTSTART`/`DTEND`/`UID` is *present but syntactically
 *    invalid* (e.g. `DTSTART:NOT-A-VALID-DATE`) is also skipped. Unlike a
 *    missing property (which ical.js resolves to `null`), a malformed-but-
 *    present value throws synchronously from inside ical.js the moment the
 *    property is read/hydrated -- so extraction for each VEVENT happens
 *    inside a try/catch, and any VEVENT that throws while being read is
 *    treated the same as one with a missing property: skipped, without
 *    losing the rest of the feed.
 */
export function parseIcsFeedForTag(icsText: string, syncTag: string): ParsedIcsEvent[] {
  const needle = syncTag.trim().toLowerCase();
  if (!needle) {
    return [];
  }

  const jcalData = ICAL.parse(icsText);
  const component = new ICAL.Component(jcalData);
  const vevents = component.getAllSubcomponents("vevent");

  const parsedEvents: ParsedIcsEvent[] = [];

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    try {
      // Read every property this event needs up front, inside the try:
      // a syntactically invalid DTSTART/DTEND/UID throws the moment it's
      // read (not lazily later), so anything that can throw must be read
      // here rather than after the tag-match check below.
      const { uid, startDate, endDate, summary, description, location } = event;
      if (!uid || !startDate) continue;

      const summaryLower = (summary ?? "").toLowerCase();
      const descriptionLower = (description ?? "").toLowerCase();
      const categoriesProp = event.component.getFirstProperty("categories");
      const categories: string[] = categoriesProp
        ? (categoriesProp.getValues() as string[]).map((c) => c.toLowerCase())
        : [];
      const matchesTag =
        summaryLower.includes(needle) ||
        descriptionLower.includes(needle) ||
        categories.some((category) => category.includes(needle));
      if (!matchesTag) continue;

      const place = (location ?? "").replace(/\s+/g, " ").trim();
      parsedEvents.push({
        externalEventId: uid,
        startsAt: startDate.toJSDate().toISOString(),
        endsAt: endDate ? endDate.toJSDate().toISOString() : null,
        summary: summary ?? "",
        title: stripSyncTag(summary ?? "", syncTag),
        location: place ? place.slice(0, LOCATION_MAX) : null,
      });
    } catch {
      continue;
    }
  }

  return parsedEvents;
}

export type EventUpsertRow = {
  member_id: string;
  calendar_connection_id: string;
  source: "ics";
  external_event_id: string;
  starts_at: string;
  ends_at: string | null;
  title: string | null;
  venue_name: string | null;
  address: string | null;
};

/**
 * Builds exactly the columns a re-sync is allowed to write: the times, and
 * the title and place from the calendar. Deliberately
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
    // The calendar is the source of truth for these: a re-sync updates them.
    title: event.title,
    venue_name: venueFromLocation(event.location),
    address: event.location,
  }));
}

/**
 * The synced events a re-sync should remove: the ones this connection
 * imported before that are no longer in the feed with the tag (deleted in
 * the calendar, or the tag taken off). Only called after the feed was
 * fetched and parsed successfully, so a failed fetch never removes anything.
 */
export function staleSyncedEventIds(
  existing: Array<{ id: string; external_event_id: string | null }>,
  parsedEvents: ParsedIcsEvent[],
): string[] {
  const keep = new Set(parsedEvents.map((event) => event.externalEventId));
  return existing
    .filter((row) => !row.external_event_id || !keep.has(row.external_event_id))
    .map((row) => row.id);
}
