import { describe, expect, it } from "vitest";
import { effectiveOffer, validateOfferText } from "./offers";

describe("effectiveOffer", () => {
  it("shows the standard offer until the Guild approves the brewer's own", () => {
    expect(effectiveOffer(null)).toBe("Your first beer for a nickel");
    expect(effectiveOffer({ offerText: "Free flight", status: "pending" })).toBe("Your first beer for a nickel");
    expect(effectiveOffer({ offerText: "Free flight", status: "declined" })).toBe("Your first beer for a nickel");
    expect(effectiveOffer({ offerText: "Free flight", status: "approved" })).toBe("Free flight");
  });
});

describe("validateOfferText", () => {
  it("trims and checks the length", () => {
    expect(validateOfferText("  Free   flight ")).toEqual({ ok: true, text: "Free flight" });
    expect(validateOfferText("ab")).toEqual({ ok: false, message: "Write at least 3 characters." });
    expect(validateOfferText("x".repeat(141))).toEqual({ ok: false, message: "Keep the offer to 140 characters or fewer." });
  });
});
