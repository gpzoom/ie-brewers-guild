import { describe, expect, it } from "vitest";
import { computeHoursConfirmationBadge, isEveryAppearanceInThePast } from "./publish-gate";

describe("computeHoursConfirmationBadge", () => {
  it("is never_confirmed for a null timestamp (imported members must not see a stale warning)", () => {
    expect(computeHoursConfirmationBadge(null)).toEqual({ kind: "never_confirmed" });
  });

  it("is recently_confirmed for a timestamp within 90 days", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const confirmedAt = new Date("2026-05-01T00:00:00Z").toISOString();
    expect(computeHoursConfirmationBadge(confirmedAt, now)).toEqual({ kind: "recently_confirmed", confirmedAt });
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
    expect(isEveryAppearanceInThePast(["2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"], now)).toBe(true);
  });

  it("is false when at least one appearance is in the future", () => {
    expect(isEveryAppearanceInThePast(["2026-01-01T00:00:00Z", "2026-12-01T00:00:00Z"], now)).toBe(false);
  });
});
