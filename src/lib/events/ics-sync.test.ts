import { describe, expect, it } from "vitest";
import { buildEventUpsertRows, parseIcsFeedForTag } from "./ics-sync";

const SAMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:event-1@example.com
DTSTART:20261010T190000Z
DTEND:20261010T220000Z
SUMMARY:Trivia Night [guild]
END:VEVENT
BEGIN:VEVENT
UID:event-2@example.com
DTSTART:20261012T120000Z
DTEND:20261012T140000Z
SUMMARY:Dentist appointment
END:VEVENT
BEGIN:VEVENT
UID:event-3@example.com
DTSTART:20261015T170000Z
DTEND:20261015T210000Z
SUMMARY:Release Party
CATEGORIES:guild,release
END:VEVENT
END:VCALENDAR`;

// Real-world calendar exports (Google Calendar, Outlook, Apple Calendar)
// commonly qualify local times with a TZID parameter plus an embedded
// VTIMEZONE block, rather than emitting bare UTC "Z" timestamps. The
// VTIMEZONE below is the standard tzdata-derived America/Los_Angeles
// definition (post-2007 US DST rule: starts 2nd Sunday of March, ends
// 1st Sunday of November), the same shape Google Calendar's own ICS
// export produces.
//
// The event below is DTSTART;TZID=America/Los_Angeles:20261010T120000.
// October 10, 2026 falls between the 2026 DST boundaries (March 8 -
// November 1, 2026), so America/Los_Angeles is in PDT (UTC-7) on that
// date. 12:00 PDT (UTC-7) => 19:00 UTC. Likewise DTEND 14:00 PDT => 21:00 UTC.
const SAMPLE_ICS_WITH_TZID = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VTIMEZONE
TZID:America/Los_Angeles
X-LIC-LOCATION:America/Los_Angeles
BEGIN:DAYLIGHT
TZOFFSETFROM:-0800
TZOFFSETTO:-0700
TZNAME:PDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0700
TZOFFSETTO:-0800
TZNAME:PST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:event-tzid-1@example.com
DTSTART;TZID=America/Los_Angeles:20261010T120000
DTEND;TZID=America/Los_Angeles:20261010T140000
SUMMARY:TZID Test Event [guild]
END:VEVENT
END:VCALENDAR`;

describe("parseIcsFeedForTag", () => {
  it("keeps only events matching the sync tag by title", () => {
    const ids = parseIcsFeedForTag(SAMPLE_ICS, "guild")
      .map((e) => e.externalEventId)
      .sort();
    expect(ids).toEqual(["event-1@example.com", "event-3@example.com"]);
  });

  it("excludes an event with no matching title or category", () => {
    const events = parseIcsFeedForTag(SAMPLE_ICS, "guild");
    expect(events.some((e) => e.externalEventId === "event-2@example.com")).toBe(false);
  });

  it("matches on category as well as title", () => {
    expect(parseIcsFeedForTag(SAMPLE_ICS, "release").map((e) => e.externalEventId)).toEqual([
      "event-3@example.com",
    ]);
  });

  it("resolves a TZID-qualified local time (via an embedded VTIMEZONE) to the correct UTC instant", () => {
    const events = parseIcsFeedForTag(SAMPLE_ICS_WITH_TZID, "guild");
    expect(events).toHaveLength(1);
    // 12:00 PDT (UTC-7, since Oct 10 2026 is within DST) -> 19:00 UTC.
    expect(events[0].startsAt).toBe("2026-10-10T19:00:00.000Z");
    // 14:00 PDT -> 21:00 UTC.
    expect(events[0].endsAt).toBe("2026-10-10T21:00:00.000Z");
  });
});

describe("buildEventUpsertRows", () => {
  it("never includes any overlay_* column -- the single reason overlays survive a re-sync", () => {
    const events = parseIcsFeedForTag(SAMPLE_ICS, "guild");
    const rows = buildEventUpsertRows("member-1", "conn-1", events);
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain("overlay_status");
      expect(Object.keys(row)).not.toContain("overlay_starts_at");
      expect(Object.keys(row)).not.toContain("overlay_note");
      expect(Object.keys(row)).not.toContain("overlay_set_at");
    }
    expect(rows).toHaveLength(2);
  });
});
