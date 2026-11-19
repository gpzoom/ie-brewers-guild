import { describe, expect, it } from "vitest";
import { activeCampaignYear, joinPageUrl, validateTrailJoin } from "@/lib/tap-card/trail-join";

describe("joinPageUrl", () => {
  it("carries the plate so the sale is credited to that brewery", () => {
    expect(joinPageUrl("ABCD1234")).toBe("/trail/join?plate=ABCD1234");
    expect(joinPageUrl(null)).toBe("/trail/join");
  });
});

describe("validateTrailJoin", () => {
  it("needs a real email and the 21+ box", () => {
    expect(validateTrailJoin({ email: "pat@example.test", ageConfirmed: true })).toEqual({});
    expect(validateTrailJoin({ email: "nope", ageConfirmed: true })).toEqual({ email: "Enter a valid email address." });
    expect(validateTrailJoin({ email: "pat@example.test", ageConfirmed: false })).toEqual({ ageConfirmed: "You must be 21 or older to join." });
  });
});

describe("activeCampaignYear", () => {
  it("sells the soonest trail that hasn't ended", () => {
    expect(activeCampaignYear([2027], 2026)).toBe(2027);
    expect(activeCampaignYear([2026, 2027], 2026)).toBe(2026);
    expect(activeCampaignYear([2026, 2027], 2027)).toBe(2027);
    expect(activeCampaignYear([2026], 2027)).toBeNull();
    expect(activeCampaignYear([], 2027)).toBeNull();
  });
});
