import { describe, expect, it } from "vitest";
import { resultBanner, shortDate } from "./CheckInScreen";

describe("resultBanner", () => {
  it("uses the plan's exact copy", () => {
    expect(resultBanner({ kind: "recorded", redeemed: false, rewards: [] })).toBe("Visit recorded");
    expect(resultBanner({ kind: "recorded", redeemed: true, rewards: [] })).toBe("Visit recorded — offer redeemed");
    expect(resultBanner({ kind: "already-visited-today", redeemed: false, rewards: [] })).toBe("Already recorded today");
    expect(resultBanner({ kind: "already-redeemed", redeemedOn: "2026-06-01", visitRecorded: true, rewards: [] })).toBe(
      "Offer already used this year (Jun 1)",
    );
    expect(resultBanner({ kind: "not-allowed" })).toBe("This device can't record visits right now.");
  });

  it("shortDate reads a Pacific day without shifting it", () => {
    expect(shortDate("2026-12-31")).toBe("Dec 31");
  });
});
