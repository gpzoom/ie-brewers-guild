import { describe, expect, it } from "vitest";
import { TAP_CARD_TZ, tapCardDay, tapCardYear } from "./tap-card-time";

describe("Pacific day and year", () => {
  it("uses Los Angeles time", () => {
    expect(TAP_CARD_TZ).toBe("America/Los_Angeles");
  });

  it("11:30 pm Dec 31 Pacific is still the old day and year (already Jan 1 in UTC)", () => {
    const at = new Date("2027-01-01T07:30:00Z");
    expect(tapCardDay(at)).toBe("2026-12-31");
    expect(tapCardYear(at)).toBe(2026);
  });

  it("12:30 am Jan 1 Pacific is the new day and year", () => {
    const at = new Date("2027-01-01T08:30:00Z");
    expect(tapCardDay(at)).toBe("2027-01-01");
    expect(tapCardYear(at)).toBe(2027);
  });

  it("handles the spring-forward night", () => {
    expect(tapCardDay(new Date("2026-03-08T09:59:00Z"))).toBe("2026-03-08");
    expect(tapCardDay(new Date("2026-03-08T07:59:00Z"))).toBe("2026-03-07");
  });
});
