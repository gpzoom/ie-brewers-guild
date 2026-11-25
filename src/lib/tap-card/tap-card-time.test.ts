import { describe, expect, it } from "vitest";
import { TAP_CARD_TZ, tapCardDay, tapCardYear, isNewPass } from "./tap-card-time";

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

describe("isNewPass", () => {
  const now = new Date("2026-11-25T20:00:00Z"); // noon Pacific
  it("is new on the day it was made, until the first visit", () => {
    expect(isNewPass("2026-11-25T18:00:00Z", false, now)).toBe(true);
    expect(isNewPass("2026-11-25T18:00:00Z", true, now)).toBe(false);
  });
  it("isn't new on a later day, even with no visits", () => {
    expect(isNewPass("2026-11-24T20:00:00Z", false, now)).toBe(false);
  });
  it("uses the Pacific day, not the UTC one", () => {
    expect(isNewPass("2026-11-25T22:00:00Z", false, new Date("2026-11-26T04:00:00Z"))).toBe(true); // 2 PM and 8 PM Pacific
  });
});
