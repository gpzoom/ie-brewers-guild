import { describe, expect, it } from "vitest";
import { isWrongTimeZone, wrongTimeZoneMessage, zoneLabel } from "./calendar-time-zone";
import { parseIcsFeedForTag } from "./ics-sync";

describe("isWrongTimeZone", () => {
  it("is fine for Pacific Time, under any of its names", () => {
    expect(isWrongTimeZone("America/Los_Angeles")).toBe(false);
    expect(isWrongTimeZone("US/Pacific")).toBe(false);
    expect(isWrongTimeZone("PST8PDT")).toBe(false);
  });
  it("is fine when the feed doesn't say (not every calendar does)", () => {
    expect(isWrongTimeZone(null)).toBe(false);
  });
  it("is wrong for UTC or any other zone", () => {
    expect(isWrongTimeZone("UTC")).toBe(true);
    expect(isWrongTimeZone("America/New_York")).toBe(true);
    expect(isWrongTimeZone("America/Phoenix")).toBe(true);
  });
});

describe("wrongTimeZoneMessage", () => {
  it("names the zone and says how to fix it", () => {
    expect(wrongTimeZoneMessage("UTC")).toBe(
      "This Google Calendar is set to UTC, not Pacific Time. In Google Calendar, open Settings, choose this calendar, and set its Time zone to (GMT-08:00) Pacific Time - Los Angeles. Check that your event times still look right, then save the link here again.",
    );
    expect(zoneLabel("America/New_York")).toBe("America/New_York");
    expect(zoneLabel("Etc/UTC")).toBe("UTC");
  });
});

const header = (zone: string | null) =>
  `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Google Inc//Google Calendar 70.9054//EN\n${zone ? `X-WR-TIMEZONE:${zone}\n` : ""}`;

const NEW_YORK_VTIMEZONE = `BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:STANDARD
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
END:DAYLIGHT
END:VTIMEZONE
`;

const LA_VTIMEZONE = `BEGIN:VTIMEZONE
TZID:America/Los_Angeles
BEGIN:STANDARD
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
TZOFFSETFROM:-0700
TZOFFSETTO:-0800
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
TZOFFSETFROM:-0800
TZOFFSETTO:-0700
END:DAYLIGHT
END:VTIMEZONE
`;

const NOW = new Date("2026-10-26T12:00:00Z");

describe("a calendar set to the wrong time zone (temporary conversion)", () => {
  it("shows a UTC calendar's 2 PM as 2 PM Pacific (Left Coast)", () => {
    const ics = `${header("UTC")}BEGIN:VEVENT
UID:hh@google.com
DTSTART:20261102T140000Z
DTEND:20261102T160000Z
SUMMARY:HAPPY HOUR #guild
END:VEVENT
END:VCALENDAR`;
    const [e] = parseIcsFeedForTag(ics, "#guild", "America/Los_Angeles", NOW);
    // Nov 2 is after daylight time ends: 2 PM PST is 22:00 UTC.
    expect(e.startsAt).toBe("2026-11-02T22:00:00.000Z");
    expect(e.endsAt).toBe("2026-11-03T00:00:00.000Z");
  });

  it("keeps a weekly UTC series at the same Pacific time across the daylight-time change", () => {
    const ics = `${header("UTC")}BEGIN:VEVENT
UID:karaoke@google.com
DTSTART:20261027T180000Z
DTEND:20261027T210000Z
RRULE:FREQ=WEEKLY;COUNT=2;BYDAY=TU
SUMMARY:Karaoke #guild
END:VEVENT
END:VCALENDAR`;
    const events = parseIcsFeedForTag(ics, "#guild", "America/Los_Angeles", NOW);
    // 6 PM PDT on Oct 27 is 01:00 UTC; 6 PM PST on Nov 3 is 02:00 UTC.
    expect(events.map((e) => e.startsAt)).toEqual(["2026-10-28T01:00:00.000Z", "2026-11-04T02:00:00.000Z"]);
  });

  it("shows a New York calendar's 6 PM as 6 PM Pacific, whether Google wrote it in UTC or New York time", () => {
    const ics = `${header("America/New_York")}${NEW_YORK_VTIMEZONE}BEGIN:VEVENT
UID:one@google.com
DTSTART:20261102T230000Z
SUMMARY:Trivia #guild
END:VEVENT
BEGIN:VEVENT
UID:two@google.com
DTSTART;TZID=America/New_York:20261102T180000
SUMMARY:Bingo #guild
END:VEVENT
END:VCALENDAR`;
    const events = parseIcsFeedForTag(ics, "#guild", "America/Los_Angeles", NOW);
    expect(events.map((e) => e.startsAt)).toEqual(["2026-11-03T02:00:00.000Z", "2026-11-03T02:00:00.000Z"]);
  });

  it("leaves an event the member set in Pacific Time alone", () => {
    const ics = `${header("UTC")}${LA_VTIMEZONE}BEGIN:VEVENT
UID:pt@google.com
DTSTART;TZID=America/Los_Angeles:20261102T180000
SUMMARY:Already Pacific #guild
END:VEVENT
END:VCALENDAR`;
    const [e] = parseIcsFeedForTag(ics, "#guild", "America/Los_Angeles", NOW);
    expect(e.startsAt).toBe("2026-11-03T02:00:00.000Z");
  });

  it("leaves all-day entries alone", () => {
    const ics = `${header("UTC")}BEGIN:VEVENT
UID:day@google.com
DTSTART;VALUE=DATE:20261102
DTEND;VALUE=DATE:20261103
SUMMARY:Anniversary #guild
END:VEVENT
END:VCALENDAR`;
    const [e] = parseIcsFeedForTag(ics, "#guild", "America/Los_Angeles", NOW);
    expect(e.startsAt).toBe("2026-11-02T08:00:00.000Z");
  });

  it("changes nothing for a Pacific calendar, or one that doesn't name its zone", () => {
    for (const zone of ["America/Los_Angeles", null]) {
      const ics = `${header(zone)}BEGIN:VEVENT
UID:x@google.com
DTSTART:20261102T140000Z
SUMMARY:Same #guild
END:VEVENT
END:VCALENDAR`;
      expect(parseIcsFeedForTag(ics, "#guild", "America/Los_Angeles", NOW)[0].startsAt).toBe("2026-11-02T14:00:00.000Z");
    }
  });
});
