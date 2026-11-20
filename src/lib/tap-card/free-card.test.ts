import { describe, expect, it } from "vitest";
import { freeCardUrl, validateFreeCard } from "@/lib/tap-card/free-card";

describe("freeCardUrl", () => {
  it("carries the plate so the card starts at that member", () => {
    expect(freeCardUrl("ABCD1234")).toBe("/card/join?plate=ABCD1234");
    expect(freeCardUrl(null)).toBe("/card/join");
  });
});

describe("validateFreeCard", () => {
  const ok = { name: "Pat Pass", email: "pat@example.test", ageConfirmed: true };
  it("accepts a name, an email and the 21+ box", () => {
    expect(validateFreeCard(ok)).toEqual({});
  });
  it("needs each one", () => {
    expect(validateFreeCard({ ...ok, name: "  " })).toEqual({ name: "Enter your name." });
    expect(validateFreeCard({ ...ok, name: "x".repeat(81) })).toEqual({ name: "Keep your name to 80 characters or fewer." });
    expect(validateFreeCard({ ...ok, email: "nope" })).toEqual({ email: "Enter a valid email address." });
    expect(validateFreeCard({ ...ok, ageConfirmed: false })).toEqual({ ageConfirmed: "You must be 21 or older to get a Tap Card." });
  });
});
