import { describe, expect, it } from "vitest";
import {
  canSubmitPublish,
  computeHoursConfirmationBadge,
  formatWeekdayHours,
  isEveryAppearanceInThePast,
} from "./publish-gate";

describe("computeHoursConfirmationBadge", () => {
  it("is never_confirmed for a null timestamp (imported members must not see a stale warning)", () => {
    expect(computeHoursConfirmationBadge(null)).toEqual({ kind: "never_confirmed" });
  });

  it("is recently_confirmed for a timestamp within 90 days", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const confirmedAt = new Date("2026-05-01T00:00:00Z").toISOString();
    expect(computeHoursConfirmationBadge(confirmedAt, now)).toEqual({
      kind: "recently_confirmed",
      confirmedAt,
    });
  });

  it("is stale for a timestamp more than 90 days old", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const confirmedAt = new Date("2026-01-01T00:00:00Z").toISOString();
    const result = computeHoursConfirmationBadge(confirmedAt, now);
    expect(result.kind).toBe("stale");
    if (result.kind === "stale") expect(result.daysAgo).toBeGreaterThan(90);
  });

  it("is exactly at the boundary still recently_confirmed at 90 days", () => {
    const confirmedAt = new Date("2026-01-01T00:00:00Z").toISOString();
    const now = new Date(new Date(confirmedAt).getTime() + 90 * 24 * 60 * 60 * 1000);
    expect(computeHoursConfirmationBadge(confirmedAt, now).kind).toBe("recently_confirmed");
  });
});

describe("isEveryAppearanceInThePast", () => {
  const now = new Date("2026-06-01T00:00:00Z");

  it("is true when there are no appearances at all", () => {
    expect(isEveryAppearanceInThePast([], now)).toBe(true);
  });

  it("is true when every appearance is in the past", () => {
    expect(isEveryAppearanceInThePast(["2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"], now)).toBe(
      true,
    );
  });

  it("is false when at least one appearance is in the future", () => {
    expect(isEveryAppearanceInThePast(["2026-01-01T00:00:00Z", "2026-12-01T00:00:00Z"], now)).toBe(
      false,
    );
  });
});

describe("formatWeekdayHours", () => {
  const base = { closes_next_day: false };
  it("is 'Not set' when there is no row for that weekday", () => {
    expect(
      formatWeekdayHours(
        [{ ...base, weekday: 2, is_closed: false, opens_at: "09:00", closes_at: "17:00" }],
        1,
      ),
    ).toBe("Not set");
  });

  it("formats open rows and closed rows, joining split shifts", () => {
    const hours = [
      { ...base, weekday: 1, is_closed: false, opens_at: "11:00", closes_at: "14:00" },
      { ...base, weekday: 1, is_closed: false, opens_at: "17:00", closes_at: "22:00" },
      { ...base, weekday: 0, is_closed: true, opens_at: null, closes_at: null },
    ];
    expect(formatWeekdayHours(hours, 1)).toBe("11:00–14:00, 17:00–22:00");
    expect(formatWeekdayHours(hours, 0)).toBe("Closed");
  });
});

describe("canSubmitPublish", () => {
  it("is false until fresh data has loaded, even if confirmed", () => {
    expect(canSubmitPublish({ freshDataLoaded: false, isMobile: false, confirmed: true })).toBe(
      false,
    );
    expect(canSubmitPublish({ freshDataLoaded: false, isMobile: true, confirmed: false })).toBe(
      false,
    );
  });

  it("requires the confirmation for producer/allied members", () => {
    expect(canSubmitPublish({ freshDataLoaded: true, isMobile: false, confirmed: false })).toBe(
      false,
    );
    expect(canSubmitPublish({ freshDataLoaded: true, isMobile: false, confirmed: true })).toBe(
      true,
    );
  });

  it("does not require the confirmation for mobile members", () => {
    expect(canSubmitPublish({ freshDataLoaded: true, isMobile: true, confirmed: false })).toBe(
      true,
    );
  });
});
