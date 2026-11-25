import { describe, expect, it } from "vitest";
import {
  ACTIVITY_RANGES,
  FLAG_ORDER,
  eventLabel,
  flagText,
  formatActivityDay,
  formatActivityTime,
  isActivityEmpty,
  locationLabel,
  methodLabel,
  personName,
  totalsText,
} from "./staff-activity-text";

describe("totalsText", () => {
  it("joins counts with a dot and omits zero undone", () => {
    expect(totalsText({ checkIns: 42, rewards: 9, undone: 1 })).toBe("42 check-ins · 9 rewards · 1 undone");
    expect(totalsText({ checkIns: 38, rewards: 7, undone: 0 })).toBe("38 check-ins · 7 rewards");
  });
  it("uses singulars", () => {
    expect(totalsText({ checkIns: 1, rewards: 1, undone: 2 })).toBe("1 check-in · 1 reward · 2 undone");
    expect(totalsText({ checkIns: 0, rewards: 0, undone: 0 })).toBe("0 check-ins · 0 rewards");
  });
});

describe("flagText", () => {
  it("names each flag with its count", () => {
    expect(flagText("outside-hours", 6)).toBe("6 outside open hours");
    expect(flagText("burst", 2)).toBe("2 close together");
    expect(flagText("same-customer", 1)).toBe("1 same customer");
    expect(flagText("turned-off-code", 3)).toBe("3 turned-off QR used");
  });
  it("gives the bare label without a count", () => {
    expect(flagText("burst")).toBe("close together");
  });
});

describe("labels", () => {
  it("names events", () => {
    expect(eventLabel("check-in")).toBe("Check-in");
    expect(eventLabel("reward-used")).toBe("Reward used");
    expect(eventLabel("reward-undone")).toBe("Reward undone");
    expect(eventLabel("turned-off-code")).toBe("Turned-off QR scanned");
  });
  it("shows the method only for a person's or shared code", () => {
    expect(methodLabel("qr", "check-in", "staff:a")).toBe("QR");
    expect(methodLabel("pin", "reward-used", "staff-code")).toBe("4-digit code");
    expect(methodLabel("qr", "check-in", "counter")).toBeNull();
    expect(methodLabel("qr", "turned-off-code", "staff:a")).toBeNull();
  });
  it("marks a removed person", () => {
    expect(personName("Maria", true)).toBe("Maria (removed)");
    expect(personName("Maria", false)).toBe("Maria");
    expect(personName("Removed staff", true)).toBe("Removed staff");
  });
  it("lists the ranges with 30 days as the default first-class option", () => {
    expect(ACTIVITY_RANGES.map((r) => r.value)).toEqual([7, 30, 90, "all"]);
    expect(ACTIVITY_RANGES.map((r) => r.label)).toEqual(["Last 7 days", "Last 30 days", "Last 90 days", "All time"]);
  });
});

describe("dates", () => {
  const now = new Date("2026-11-23T22:30:00Z");
  it("shows Pacific time", () => {
    expect(formatActivityTime("2026-11-23T22:14:00Z", now)).toBe("Nov 23, 2:14 PM");
    expect(formatActivityTime("2026-07-04T07:05:00Z", now)).toBe("Jul 4, 12:05 AM");
  });
  it("shows a day", () => {
    expect(formatActivityDay("2026-11-22", now)).toBe("Nov 22");
  });
  it("adds the year when it isn't this year, by Pacific time", () => {
    expect(formatActivityTime("2025-11-23T22:14:00Z", now)).toBe("Nov 23, 2025, 2:14 PM");
    expect(formatActivityDay("2025-11-22", now)).toBe("Nov 22, 2025");
    const newYearsEve = new Date("2027-01-01T05:00:00Z"); // still Dec 31, 2026 in Pacific
    expect(formatActivityTime("2026-12-31T22:14:00Z", newYearsEve)).toBe("Dec 31, 2:14 PM");
    expect(formatActivityTime("2027-01-01T05:00:00Z", new Date("2027-01-01T20:00:00Z"))).toBe("Dec 31, 2026, 9:00 PM");
    expect(formatActivityDay("2026-12-31", newYearsEve)).toBe("Dec 31");
  });
  it("survives a bad value", () => {
    expect(formatActivityTime("nope", now)).toBe("");
  });
});

describe("isActivityEmpty", () => {
  const row = { checkIns: 0, rewards: 0, undone: 0, flags: {} };
  it("is empty with no counts and no flags", () => {
    expect(isActivityEmpty({ rows: [row, { ...row, flags: { burst: 0 } }], beforeTracking: 0 })).toBe(true);
    expect(isActivityEmpty({ rows: [], beforeTracking: 0 })).toBe(true);
  });
  it("isn't with a turned-off QR scan alone", () => {
    expect(isActivityEmpty({ rows: [{ ...row, flags: { "turned-off-code": 1 } }], beforeTracking: 0 })).toBe(false);
  });
  it("isn't with any count or a visit before tracking", () => {
    for (const k of ["checkIns", "rewards", "undone"]) expect(isActivityEmpty({ rows: [{ ...row, [k]: 1 }], beforeTracking: 0 })).toBe(false);
    expect(isActivityEmpty({ rows: [row], beforeTracking: 1 })).toBe(false);
  });
});

describe("location wording", () => {
  it("names the flags and words", () => {
    expect(flagText("far", 2)).toBe("2 far from the taproom");
    expect(flagText("no-location")).toBe("no location");
    expect(FLAG_ORDER.slice(0, 3)).toEqual(["outside-hours", "far", "no-location"]);
    expect([locationLabel("near"), locationLabel("far"), locationLabel("none"), locationLabel(null)]).toEqual(["Near", "Far away", "No location", null]);
  });
});
