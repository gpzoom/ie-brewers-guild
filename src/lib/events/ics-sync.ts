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
  /** The event's DESCRIPTION as plain text, without the sync tag; null when nothing is left. */
  description: string | null;
  /** An all-day entry (a DATE, not a time): stored from the member's local midnight, shown as "All day". */
  allDay: boolean;
  /** Where the entry's picture comes from (an image attachment, or an image link in the description). */
  imageSource: string | null;
};

/**
 * The UTC instant of local midnight on a YYYY-MM-DD date in an IANA time
 * zone -- so an all-day entry on Oct 1 in Los Angeles starts at Oct 1, 7am
 * UTC, not Oct 1 00:00 UTC (which is still Sept 30 there).
 */
export function zonedMidnightUtc(date: string, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day);
  // How far the zone is from UTC around that moment, read back through Intl.
  const offsetAt = (instant: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(instant));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
    return asUtc - instant;
  };
  const first = guess - offsetAt(guess);
  // Once more, in case midnight falls on the other side of a clock change.
  return new Date(guess - offsetAt(first)).toISOString();
}

const IMAGE_LINK = /https?:\/\/[^\s<>"']+\.(?:jpe?g|png|webp|gif)(?:\?[^\s<>"']*)?/i;

/**
 * Where an entry's picture comes from: the first image attachment
 * (Google Calendar adds one as an ATTACH with an image FMTTYPE, pointing
 * at the file in Google Drive), else the first direct image link in the
 * description. Only http(s).
 */
export function findImageSource(
  attachments: Array<{ url: string; type: string | null }>,
  rawDescription: string | null | undefined,
): string | null {
  const attached = attachments.find(
    (item) => (item.type ?? "").toLowerCase().startsWith("image/") && /^https?:\/\//i.test(item.url),
  );
  if (attached) return attached.url;
  const match = (rawDescription ?? "").replace(/&amp;/gi, "&").match(IMAGE_LINK);
  return match ? match[0] : null;
}

const TITLE_MAX = 200;
const LOCATION_MAX = 300;
export const DESCRIPTION_MAX = 1000;

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

/**
 * Google wraps links in its descriptions as
 * "https://www.google.com/url?q=<the real address>&sa=…"; this returns the
 * real address. Anything else comes back as it was.
 */
function unwrapGoogleRedirect(href: string): string {
  try {
    const url = new URL(href);
    if (/(^|\.)google\.com$/i.test(url.hostname) && url.pathname === "/url") {
      return url.searchParams.get("q") ?? href;
    }
  } catch {
    /* not a URL: left as it was */
  }
  return href;
}

/**
 * An `<a href>` in a description, as text the profile can link again
 * (linkifyText): the address itself when the link's text is the address,
 * otherwise "text (address)". Only http(s) addresses are kept; any other
 * kind of link is reduced to its text.
 */
function linkToText(
  _match: string,
  _quoted: string,
  doubleQuoted: string | undefined,
  singleQuoted: string | undefined,
  inner: string,
): string {
  const label = inner.replace(/<[^>]*>/g, "").trim();
  const href = unwrapGoogleRedirect(
    (doubleQuoted ?? singleQuoted ?? "").replace(/&amp;/gi, "&").trim(),
  );
  if (!/^https?:\/\//i.test(href)) return label;
  const labelIsAddress =
    !label || href.replace(/\/$/, "").toLowerCase().endsWith(label.replace(/\/$/, "").toLowerCase());
  return labelIsAddress ? href : `${label} (${href})`;
}

/**
 * An event's description as plain text for the profile. Calendars send it
 * in different shapes -- Google Calendar sends the HTML its editor makes
 * ("<b>", "<br>", "<a href>") and appends a block of Google Meet joining
 * details when the event has a video call -- so this:
 *  - drops the Google Meet block (it starts with a "-::~:~::~" divider);
 *  - turns line breaks and paragraph ends into new lines, and removes every
 *    other tag (a link keeps its address, as "text (address)" -- see linkToText);
 *  - decodes the common HTML entities;
 *  - takes the sync tag out, as for the title;
 *  - tidies spaces and blank lines, and caps the length.
 * The profile renders the result as text (React escapes it), never as HTML.
 */
export function cleanEventDescription(
  raw: string | null | undefined,
  syncTag: string,
): string | null {
  if (!raw) return null;
  let text = raw;
  const meet = text.search(/-::~:~::~/);
  if (meet >= 0) text = text.slice(0, meet);
  text = text
    .replace(/<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/gi, linkToText)
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(#39|[a-z]+);/gi,
      (match, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? match,
    )
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)));
  const bare = syncTag.trim().replace(/^#+/, "");
  if (bare) {
    text = text.replace(new RegExp(`[\\[(]?#${escapeRegExp(bare)}[\\])]?`, "gi"), "");
  }
  const lines = text.split(/\r?\n/).map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim());
  const tidied = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!tidied) return null;
  return tidied.length > DESCRIPTION_MAX
    ? `${tidied.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`
    : tidied;
}

function nextDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

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
export function parseIcsFeedForTag(
  icsText: string,
  syncTag: string,
  timeZone = "America/Los_Angeles",
): ParsedIcsEvent[] {
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
      // An all-day entry is a DATE with no time: start it at the member's
      // own local midnight (toJSDate would use the server's, UTC, which
      // puts Oct 1 on the evening of Sept 30 in California). Its end is
      // the day after its last day (or the next day when there's none).
      const allDay = startDate.isDate;
      const startDay = startDate.toString().slice(0, 10);
      const startsAt = allDay ? zonedMidnightUtc(startDay, timeZone) : startDate.toJSDate().toISOString();
      let endsAt: string | null;
      if (allDay) {
        const endDay = endDate?.isDate ? endDate.toString().slice(0, 10) : null;
        endsAt = zonedMidnightUtc(endDay ?? nextDay(startDay), timeZone);
      } else {
        endsAt = endDate ? endDate.toJSDate().toISOString() : null;
      }
      const attachments = event.component.getAllProperties("attach").map((prop) => ({
        url: String(prop.getFirstValue() ?? ""),
        type: (prop.getParameter("fmttype") as string | undefined) ?? null,
      }));
      parsedEvents.push({
        externalEventId: uid,
        startsAt,
        endsAt,
        summary: summary ?? "",
        title: stripSyncTag(summary ?? "", syncTag),
        location: place ? place.slice(0, LOCATION_MAX) : null,
        description: cleanEventDescription(description, syncTag),
        allDay,
        imageSource: findImageSource(attachments, description),
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
  kind: "event" | "food";
  external_event_id: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  title: string | null;
  description: string | null;
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
  kind: "event" | "food" = "event",
): EventUpsertRow[] {
  return parsedEvents.map((event) => ({
    member_id: memberId,
    calendar_connection_id: calendarConnectionId,
    source: "ics" as const,
    // A food calendar's entries are food vendors (the profile's "Food this
    // week"), kept apart from the member's events everywhere.
    kind,
    external_event_id: event.externalEventId,
    starts_at: event.startsAt,
    ends_at: event.endsAt,
    // The calendar is the source of truth for these: a re-sync updates them.
    all_day: event.allDay,
    title: event.title,
    description: event.description,
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
