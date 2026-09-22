import { describe, expect, it } from "vitest";
import { computeOpenNow, formatDurationLabel } from "./open-now";

const PT = "America/Los_Angeles";

describe("formatDurationLabel", () => {
  it("formats hours and minutes", () => {
    expect(formatDurationLabel(160)).toBe("2 hr 40 min");
  });

  it("formats a duration under one hour", () => {
    expect(formatDurationLabel(30)).toBe("0 hr 30 min");
  });
});

describe("computeOpenNow", () => {
  it("reports unknown when there are no hours at all", () => {
    expect(
      computeOpenNow({ now: new Date("2026-09-22T20:00:00Z"), timezone: PT, hours: [], specialHours: [] }),
    ).toEqual({ status: "unknown" });
  });

  it("is open during a normal same-day interval", () => {
    // Tuesday 2026-09-22, 20:00 UTC = 13:00 PDT.
    const result = computeOpenNow({
      now: new Date("2026-09-22T20:00:00Z"),
      timezone: PT,
      hours: [{ weekday: 2, opensAt: "09:00", closesAt: "17:00", closesNextDay: false, isClosed: false }],
      specialHours: [],
    });
    expect(result).toEqual({ status: "open", closesInLabel: "Closes in 4 hr 0 min", note: null });
  });

  it("is closed before opening, and reports the next opening later the same day", () => {
    // Tuesday 2026-09-22, 14:00 UTC = 07:00 PDT.
    const result = computeOpenNow({
      now: new Date("2026-09-22T14:00:00Z"),
      timezone: PT,
      hours: [{ weekday: 2, opensAt: "09:00", closesAt: "17:00", closesNextDay: false, isClosed: false }],
      specialHours: [],
    });
    expect(result).toEqual({ status: "closed", nextOpenLabel: "Opens Tuesday 9am", note: null });
  });

  it("is open after midnight via an interval that closes the next day, found by checking yesterday's row", () => {
    // Saturday 2026-09-26, 07:30 UTC = 00:30 PDT. Friday's row runs 18:00-01:00.
    const result = computeOpenNow({
      now: new Date("2026-09-26T07:30:00Z"),
      timezone: PT,
      hours: [{ weekday: 5, opensAt: "18:00", closesAt: "01:00", closesNextDay: true, isClosed: false }],
      specialHours: [],
    });
    expect(result).toEqual({ status: "open", closesInLabel: "Closes in 0 hr 30 min", note: null });
  });

  it("a special_hours closure for today wins outright, even over normally-open weekly hours", () => {
    // Thanksgiving, Thursday 2026-11-26, 20:00 UTC = 12:00 PST.
    const result = computeOpenNow({
      now: new Date("2026-11-26T20:00:00Z"),
      timezone: PT,
      hours: [{ weekday: 4, opensAt: "09:00", closesAt: "17:00", closesNextDay: false, isClosed: false }],
      specialHours: [
        { date: "2026-11-26", isClosed: true, opensAt: null, closesAt: null, closesNextDay: false, note: "Thanksgiving" },
      ],
    });
    expect(result).toEqual({ status: "closed", nextOpenLabel: "Opens Thursday 9am", note: "Thanksgiving" });
  });

  it("a special_hours override for today can also open narrower hours than usual", () => {
    // Thursday 2026-12-24, 21:00 UTC = 13:00 PST.
    const result = computeOpenNow({
      now: new Date("2026-12-24T21:00:00Z"),
      timezone: PT,
      hours: [{ weekday: 4, opensAt: "09:00", closesAt: "21:00", closesNextDay: false, isClosed: false }],
      specialHours: [
        {
          date: "2026-12-24",
          isClosed: false,
          opensAt: "10:00",
          closesAt: "14:00",
          closesNextDay: false,
          note: "Christmas Eve — early close",
        },
      ],
    });
    expect(result).toEqual({
      status: "open",
      closesInLabel: "Closes in 1 hr 0 min",
      note: "Christmas Eve — early close",
    });
  });

  it("searches forward across the week to find the next opening on a later weekday", () => {
    // Sunday 2026-09-20, 20:00 UTC = 13:00 PDT. Only Tuesday has hours.
    const result = computeOpenNow({
      now: new Date("2026-09-20T20:00:00Z"),
      timezone: PT,
      hours: [{ weekday: 2, opensAt: "09:00", closesAt: "17:00", closesNextDay: false, isClosed: false }],
      specialHours: [],
    });
    expect(result).toEqual({ status: "closed", nextOpenLabel: "Opens Tuesday 9am", note: null });
  });

  it("finds a later interval later the same day when hours are split", () => {
    // Tuesday 2026-09-22, 22:00 UTC = 15:00 PDT, between a lunch and dinner block.
    const result = computeOpenNow({
      now: new Date("2026-09-22T22:00:00Z"),
      timezone: PT,
      hours: [
        { weekday: 2, opensAt: "11:00", closesAt: "14:00", closesNextDay: false, isClosed: false },
        { weekday: 2, opensAt: "17:00", closesAt: "21:00", closesNextDay: false, isClosed: false },
      ],
      specialHours: [],
    });
    expect(result).toEqual({ status: "closed", nextOpenLabel: "Opens Tuesday 5pm", note: null });
  });
});
