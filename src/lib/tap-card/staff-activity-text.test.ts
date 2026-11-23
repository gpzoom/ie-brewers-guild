import { describe, expect, it } from "vitest";
import {
  ACTIVITY_RANGES,
  eventLabel,
  flagText,
  formatActivityDay,
  formatActivityTime,
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
  it("shows Pacific time", () => {
    expect(formatActivityTime("2026-11-23T22:14:00Z")).toBe("Nov 23, 2:14 PM");
    expect(formatActivityTime("2026-07-04T07:05:00Z")).toBe("Jul 4, 12:05 AM");
  });
  it("shows a day", () => {
    expect(formatActivityDay("2026-11-22")).toBe("Nov 22");
  });
  it("survives a bad value", () => {
    expect(formatActivityTime("nope")).toBe("");
  });
});
