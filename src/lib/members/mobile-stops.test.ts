import { describe, expect, it } from "vitest";
import { formatStopDay, formatStopTime, pickNextStop, pickTodaysStop, type StopEvent } from "./mobile-stops";

function stop(overrides: Partial<StopEvent>): StopEvent {
  return {
    id: "e1",
    member_id: "m1",
    title: "Tacos",
    venue_name: null,
    city: "Riverside",
    address: null,
    starts_at: "2026-10-05T00:00:00Z",
    ends_at: null,
    all_day: false,
    overlay_status: null,
    overlay_starts_at: null,
    is_hidden: false,
    latitude: null,
    longitude: null,
    geocoded_address: null,
    ...overrides,
  };
}

// Monday 5 October 2026, 3:00 pm Pacific (PDT, UTC-7) = 22:00 UTC.
const NOW = new Date("2026-10-05T22:00:00Z");

describe("pickTodaysStop", () => {
  it("picks the stop happening now over a later one today", () => {
    const now = stop({ id: "now", starts_at: "2026-10-05T21:00:00Z", ends_at: "2026-10-05T23:00:00Z" });
    const later = stop({ id: "later", starts_at: "2026-10-06T00:00:00Z", ends_at: "2026-10-06T04:00:00Z" });
    expect(pickTodaysStop([later, now], NOW)?.id).toBe("now");
  });

  it("with nothing on now, picks the next one today", () => {
    const later = stop({ id: "later", starts_at: "2026-10-06T00:00:00Z", ends_at: "2026-10-06T04:00:00Z" });
    expect(pickTodaysStop([later], NOW)?.id).toBe("later");
  });

  it("11:30 pm Pacific is still today (tomorrow in UTC)", () => {
    const late = stop({ id: "late", starts_at: "2026-10-06T06:30:00Z" });
    expect(pickTodaysStop([late], NOW)?.id).toBe("late");
  });

  it("a stop that ended earlier today is not today's stop", () => {
    const done = stop({ id: "done", starts_at: "2026-10-05T16:00:00Z", ends_at: "2026-10-05T19:00:00Z" });
    expect(pickTodaysStop([done], NOW)).toBeNull();
  });

  it("a stop with no end counts as on for 2 hours", () => {
    const open = stop({ id: "open", starts_at: "2026-10-05T20:30:00Z" });
    expect(pickTodaysStop([open], NOW)?.id).toBe("open");
    const over = stop({ id: "over", starts_at: "2026-10-05T19:30:00Z" });
    expect(pickTodaysStop([over], NOW)).toBeNull();
  });

  it("an all-day stop today is on all day", () => {
    const allDay = stop({ id: "allday", starts_at: "2026-10-05T07:00:00Z", all_day: true });
    expect(pickTodaysStop([allDay], NOW)?.id).toBe("allday");
  });

  it("skips hidden, canceled and postponed stops", () => {
    const base = { starts_at: "2026-10-05T21:00:00Z", ends_at: "2026-10-05T23:00:00Z" };
    expect(pickTodaysStop([stop({ ...base, is_hidden: true })], NOW)).toBeNull();
    expect(pickTodaysStop([stop({ ...base, overlay_status: "canceled" })], NOW)).toBeNull();
    expect(pickTodaysStop([stop({ ...base, overlay_status: "postponed" })], NOW)).toBeNull();
  });

  it("a stop rescheduled onto today counts by its new time", () => {
    const moved = stop({
      id: "moved",
      starts_at: "2026-10-01T21:00:00Z",
      overlay_status: "rescheduled",
      overlay_starts_at: "2026-10-06T01:00:00Z",
    });
    expect(pickTodaysStop([moved], NOW)?.id).toBe("moved");
  });
});

describe("pickNextStop", () => {
  it("is the first live stop after today, within 14 days", () => {
    const fri = stop({ id: "fri", starts_at: "2026-10-10T00:00:00Z" });
    const wed = stop({ id: "wed", starts_at: "2026-10-07T19:00:00Z" });
    const far = stop({ id: "far", starts_at: "2026-10-25T19:00:00Z" });
    const todayLater = stop({ id: "today", starts_at: "2026-10-06T01:00:00Z" });
    expect(pickNextStop([far, fri, wed, todayLater], NOW)?.id).toBe("wed");
    expect(pickNextStop([far], NOW)).toBeNull();
  });
});

describe("formatStopTime / formatStopDay", () => {
  it.each([
    ["2026-10-06T00:00:00Z", "2026-10-06T04:00:00Z", false, "5–9 pm"],
    ["2026-10-06T00:30:00Z", "2026-10-06T04:00:00Z", false, "5:30–9 pm"],
    ["2026-10-05T18:00:00Z", "2026-10-05T21:00:00Z", false, "11 am–2 pm"],
    ["2026-10-06T01:00:00Z", null, false, "6 pm"],
    ["2026-10-05T07:00:00Z", null, true, "All day"],
  ])("%s–%s all-day=%s -> %s", (starts_at, ends_at, all_day, text) => {
    expect(formatStopTime(stop({ starts_at, ends_at, all_day }))).toBe(text);
  });

  it("day is the short Pacific weekday", () => {
    expect(formatStopDay(stop({ starts_at: "2026-10-10T00:00:00Z" }))).toBe("Fri");
  });
});
