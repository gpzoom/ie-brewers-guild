import { describe, expect, it } from "vitest";
import { isValidIanaTimezone, listIanaTimezones } from "./timezones";

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
