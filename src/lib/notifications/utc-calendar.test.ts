import { describe, expect, it } from "vitest";
import type { MemberNotificationRow } from "@/lib/supabase/types";
import { decideUtcProblems, feedTimeZone, isUtcZone } from "./utc-calendar";

const LEFT_COAST = [
  "BEGIN:VCALENDAR",
  "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
  "X-WR-CALNAME:Events",
  "X-WR-TIMEZONE:UTC",
  "BEGIN:VEVENT",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");
const MARS = LEFT_COAST.replace("X-WR-TIMEZONE:UTC", "X-WR-TIMEZONE:America/Los_Angeles");

describe("feedTimeZone", () => {
  it("reads UTC from the Left Coast header", () => {
    expect(feedTimeZone(LEFT_COAST)).toBe("UTC");
  });
  it("reads America/Los_Angeles from the Mars header", () => {
    expect(feedTimeZone(MARS)).toBe("America/Los_Angeles");
  });
  it("returns null without the line", () => {
    expect(feedTimeZone("BEGIN:VCALENDAR\r\nEND:VCALENDAR")).toBeNull();
  });
  it("unfolds a folded line", () => {
    expect(feedTimeZone("X-WR-TIMEZONE:America/Los_\r\n Angeles\r\n")).toBe("America/Los_Angeles");
  });
});

describe("isUtcZone", () => {
  it("is true for the UTC variants, any case", () => {
    for (const z of ["UTC", "gmt", "Etc/UTC", "Etc/GMT", "etc/uct", "UCT", "Zulu"]) {
      expect(isUtcZone(z)).toBe(true);
    }
  });
  it("is false for real zones and null", () => {
    expect(isUtcZone("America/Los_Angeles")).toBe(false);
    expect(isUtcZone(null)).toBe(false);
  });
});

const conn = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  member_id: "m1",
  purpose: "events" as "events" | "food",
  feed_time_zone: "UTC" as string | null,
  feed_has_timed_events: true as boolean | null,
  ...over,
});
const members = (over: Record<string, unknown> = {}) =>
  new Map([["m1", { timezone: "America/Los_Angeles", published: true, ...over }]]);

function openRow(key: string): MemberNotificationRow {
  return { id: "r1", type: "utc_calendar", member_id: "m1", dedupe_key: key } as MemberNotificationRow;
}

describe("decideUtcProblems", () => {
  it("opens one row for a Left Coast-shaped connection", () => {
    const d = decideUtcProblems({ connections: [conn()], members: members(), openRows: [] });
    expect(d.opens).toHaveLength(1);
    expect(d.opens[0]).toMatchObject({
      type: "utc_calendar",
      member_id: "m1",
      dedupe_key: "utc_calendar:m1:c1",
      event_id: null,
      due_date: null,
      kind: "problem",
      details: { calendar_connection_id: "c1", purpose: "events", feed_time_zone: "UTC" },
    });
    expect(d.resolveRows).toEqual([]);
  });
  it("carries the food purpose", () => {
    const d = decideUtcProblems({
      connections: [conn({ purpose: "food" })],
      members: members(),
      openRows: [],
    });
    expect(d.opens[0].details.purpose).toBe("food");
  });
  it("does not open without timed events", () => {
    const d = decideUtcProblems({
      connections: [conn({ feed_has_timed_events: false })],
      members: members(),
      openRows: [],
    });
    expect(d.opens).toEqual([]);
  });
  it("does not open for a member in UTC", () => {
    const d = decideUtcProblems({
      connections: [conn()],
      members: members({ timezone: "UTC" }),
      openRows: [],
    });
    expect(d.opens).toEqual([]);
  });
  it("does not open for an unpublished member", () => {
    const d = decideUtcProblems({
      connections: [conn()],
      members: members({ published: false }),
      openRows: [],
    });
    expect(d.opens).toEqual([]);
  });
  it("keeps an already-open row without reopening", () => {
    const row = openRow("utc_calendar:m1:c1");
    const d = decideUtcProblems({ connections: [conn()], members: members(), openRows: [row] });
    expect(d.opens).toEqual([]);
    expect(d.resolveRows).toEqual([]);
  });
  it("resolves when the time zone is fixed", () => {
    const row = openRow("utc_calendar:m1:c1");
    const d = decideUtcProblems({
      connections: [conn({ feed_time_zone: "America/Los_Angeles" })],
      members: members(),
      openRows: [row],
    });
    expect(d.opens).toEqual([]);
    expect(d.resolveRows).toEqual([row]);
  });
  it("resolves when the connection is removed", () => {
    const row = openRow("utc_calendar:m1:c1");
    const d = decideUtcProblems({ connections: [], members: members(), openRows: [row] });
    expect(d.resolveRows).toEqual([row]);
  });
});
