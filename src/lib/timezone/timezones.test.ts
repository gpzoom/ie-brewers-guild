import { describe, expect, it } from "vitest";
import { fromDatetimeLocalValue, isValidIanaTimezone, listIanaTimezones, toDatetimeLocalValue } from "./timezones";

describe("listIanaTimezones", () => {
  it("includes the schema's default timezone", () => {
    expect(listIanaTimezones()).toContain("America/Los_Angeles");
  });

  it("returns a large list with no duplicates", () => {
    const zones = listIanaTimezones();
    expect(zones.length).toBeGreaterThan(300);
    expect(new Set(zones).size).toBe(zones.length);
  });
});

describe("isValidIanaTimezone", () => {
  it("accepts a real zone", () => {
    expect(isValidIanaTimezone("America/Los_Angeles")).toBe(true);
  });

  it("rejects a made-up zone", () => {
    expect(isValidIanaTimezone("Mars/OlympusMons")).toBe(false);
  });
});

describe("toDatetimeLocalValue", () => {
  it("formats a UTC instant as wall-clock time in the given zone, not UTC", () => {
    // 2026-10-06T01:00:00Z is 2026-10-05 18:00 in America/Los_Angeles
    // (PDT, UTC-7 -- DST is active in October).
    expect(toDatetimeLocalValue("2026-10-06T01:00:00.000Z", "America/Los_Angeles")).toBe("2026-10-05T18:00");
  });

  it("differs from a naive slice(0, 16) of the raw ISO string once the zone isn't UTC", () => {
    const iso = "2026-10-06T01:00:00.000Z";
    expect(toDatetimeLocalValue(iso, "America/Los_Angeles")).not.toBe(iso.slice(0, 16));
  });
});

describe("fromDatetimeLocalValue", () => {
  it("parses a naive wall-clock string as time IN THE GIVEN ZONE", () => {
    expect(fromDatetimeLocalValue("2026-10-05T18:00", "America/Los_Angeles")).toBe("2026-10-06T01:00:00.000Z");
  });

  it("round-trips through toDatetimeLocalValue back to the exact same instant", () => {
    const original = "2026-10-06T01:00:00.000Z";
    const displayed = toDatetimeLocalValue(original, "America/Los_Angeles");
    const roundTripped = fromDatetimeLocalValue(displayed, "America/Los_Angeles");
    expect(new Date(roundTripped).getTime()).toBe(new Date(original).getTime());
  });

  it("returns a standard Z-suffixed ISO string, not TZDate's own offset-suffixed form", () => {
    // TZDate's own .toISOString() would return "...-07:00" here -- this
    // function re-wraps through a plain Date so DB-sourced starts_at
    // values (always Z-form) sort/compare correctly against a freshly
    // parsed one.
    expect(fromDatetimeLocalValue("2026-10-05T18:00", "America/Los_Angeles")).toMatch(/Z$/);
  });

  it("produces the identical instant no matter what the system's own timezone is", () => {
    const originalTZ = process.env.TZ;
    try {
      const results = ["America/New_York", "UTC", "Asia/Tokyo", "America/Los_Angeles"].map((systemTz) => {
        process.env.TZ = systemTz;
        return fromDatetimeLocalValue("2026-10-05T18:00", "America/Los_Angeles");
      });
      expect(new Set(results).size).toBe(1);
      expect(results[0]).toBe("2026-10-06T01:00:00.000Z");
    } finally {
      if (originalTZ === undefined) delete process.env.TZ;
      else process.env.TZ = originalTZ;
    }
  });

  it("handles a spring-forward DST transition correctly (month indexing included -- March is monthIndex 2)", () => {
    // US DST spring-forward for 2026 is March 8th; 01:30 is still PST
    // (UTC-8), before the 2am jump to PDT (UTC-7).
    expect(fromDatetimeLocalValue("2026-03-08T01:30", "America/Los_Angeles")).toBe("2026-03-08T09:30:00.000Z");
  });

  it("handles a year boundary correctly (December is monthIndex 11)", () => {
    expect(fromDatetimeLocalValue("2026-12-31T23:30", "America/Los_Angeles")).toBe("2027-01-01T07:30:00.000Z");
  });

  it("throws on an empty value instead of silently returning garbage", () => {
    // A cleared/incomplete datetime-local input reports "" -- callers
    // must guard for this themselves (see EventsEditor.tsx's onBlur
    // handlers), but this function must fail loudly, not silently.
    expect(() => fromDatetimeLocalValue("", "America/Los_Angeles")).toThrow();
  });

  it("throws on an incomplete value missing the time part", () => {
    expect(() => fromDatetimeLocalValue("2026-10-05", "America/Los_Angeles")).toThrow();
  });
});
