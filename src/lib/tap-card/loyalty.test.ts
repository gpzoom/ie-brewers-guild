import { describe, expect, it } from "vitest";
import {
  REWARD_MAX,
  earnedOnVisit,
  expiresAt,
  offerLabel,
  pickBarRewards,
  validateMemberOffer,
  type LiveOffer,
} from "@/lib/tap-card/loyalty";
import { STANDARD_OFFER } from "@/lib/tap-card/tap-card-copy";

const offer = (o: Partial<Parameters<typeof validateMemberOffer>[0]> = {}) => ({
  slot: "step1" as const,
  visitNumber: 3,
  reward: "Free soft pretzel",
  terms: "",
  ...o,
});

describe("validateMemberOffer", () => {
  it("accepts a normal step", () => {
    expect(validateMemberOffer(offer(), [])).toEqual({ ok: true, value: offer() });
  });
  it("refuses visit 1 for a step", () => {
    expect(validateMemberOffer(offer({ visitNumber: 1 }), [])).toEqual({
      ok: false,
      message: "Visit numbers start at 2 — visit 1 is the Beer Trail offer.",
    });
  });
  it("refuses every 1 visit for the repeating reward", () => {
    expect(validateMemberOffer(offer({ slot: "repeat", visitNumber: 1 }), [])).toEqual({
      ok: false,
      message: "Pick every 2 visits or more.",
    });
  });
  it("refuses a number that isn't whole", () => {
    expect(validateMemberOffer(offer({ visitNumber: 2.5 }), [])).toEqual({ ok: false, message: "Use a whole number." });
  });
  it("rejects a visit number another step uses", () => {
    expect(validateMemberOffer(offer({ slot: "step2" }), [3])).toEqual({ ok: false, message: "Another step already uses visit 3." });
    expect(validateMemberOffer(offer({ slot: "repeat" }), [3]).ok).toBe(true);
  });
  it("checks the reward and terms length", () => {
    expect(validateMemberOffer(offer({ reward: "ab" }), [])).toEqual({ ok: false, message: "Write at least 3 characters." });
    expect(validateMemberOffer(offer({ reward: "x".repeat(REWARD_MAX + 1) }), [])).toEqual({
      ok: false,
      message: "Keep the reward to 140 characters or fewer.",
    });
    expect(validateMemberOffer(offer({ terms: "x".repeat(301) }), [])).toEqual({
      ok: false,
      message: "Keep the terms to 300 characters or fewer.",
    });
  });
  it("tidies spaces", () => {
    const result = validateMemberOffer(offer({ reward: "  Free   pretzel ", terms: " Food only.  " }), []);
    expect(result).toEqual({ ok: true, value: offer({ reward: "Free pretzel", terms: "Food only." }) });
  });
});

describe("earnedOnVisit", () => {
  const step1: LiveOffer = { slot: "step1", visitNumber: 3, reward: "Free soft pretzel", terms: "" };
  const step2: LiveOffer = { slot: "step2", visitNumber: 10, reward: "Pint glass", terms: "" };
  const repeat: LiveOffer = { slot: "repeat", visitNumber: 5, reward: "$2 off", terms: "Food" };

  it("earns a step on its visit", () => {
    expect(earnedOnVisit(3, [step1], new Set())).toEqual([{ slot: "step1", reward: "Free soft pretzel", terms: "" }]);
    expect(earnedOnVisit(4, [step1], new Set())).toEqual([]);
  });
  it("earnedOnVisit skips steps already earned", () => {
    expect(earnedOnVisit(3, [step1], new Set(["step1"]))).toEqual([]);
  });
  it("earns the repeating reward on every Nth visit", () => {
    expect(earnedOnVisit(5, [repeat], new Set()).map((r) => r.slot)).toEqual(["repeat"]);
    expect(earnedOnVisit(10, [repeat], new Set()).map((r) => r.slot)).toEqual(["repeat"]);
    expect(earnedOnVisit(7, [repeat], new Set())).toEqual([]);
  });
  it("earns a step and the repeating reward together, steps first", () => {
    expect(earnedOnVisit(10, [repeat, step2], new Set()).map((r) => r.slot)).toEqual(["step2", "repeat"]);
  });
});

describe("expiresAt", () => {
  it("adds the brewery's days", () => {
    expect(expiresAt(new Date("2026-03-01T20:00:00Z"), 90).toISOString()).toBe("2026-05-30T20:00:00.000Z");
  });
});

describe("pickBarRewards", () => {
  const now = new Date("2026-06-01T20:00:00Z");
  const a = { id: "a", reward: "Pretzel", terms: "", expiresAt: "2026-08-01T00:00:00Z", earnedAt: "2026-05-01T00:00:00Z" };
  const b = { id: "b", reward: "Glass", terms: "", expiresAt: "2026-07-01T00:00:00Z", earnedAt: "2026-05-02T00:00:00Z" };
  const c = { id: "c", reward: "Sticker", terms: "", expiresAt: "2026-07-01T00:00:00Z", earnedAt: "2026-04-02T00:00:00Z" };
  const member = (r: typeof a) => ({ kind: "member", id: r.id, reward: r.reward, terms: r.terms, expiresAt: r.expiresAt });

  it("features the Beer Trail offer first", () => {
    expect(pickBarRewards({ trailAvailable: true, banked: [a, b, c], now })).toEqual({
      featured: { kind: "trail", reward: STANDARD_OFFER },
      others: [member(c), member(b), member(a)],
    });
  });
  it("features the soonest-expiring reward when the Beer Trail offer is used", () => {
    expect(pickBarRewards({ trailAvailable: false, banked: [a, b], now })).toEqual({ featured: member(b), others: [member(a)] });
  });
  it("pickBarRewards drops expired rewards", () => {
    const old = { ...a, id: "old", expiresAt: "2026-06-01T20:00:00Z" };
    expect(pickBarRewards({ trailAvailable: false, banked: [old, b], now })).toEqual({ featured: member(b), others: [] });
  });
  it("has nothing when nothing is waiting", () => {
    expect(pickBarRewards({ trailAvailable: false, banked: [], now })).toEqual({ featured: null, others: [] });
  });
});

describe("offerLabel", () => {
  it("names steps and the repeating reward", () => {
    expect(offerLabel("step1", 3)).toBe("Visit 3");
    expect(offerLabel("repeat", 5)).toBe("Every 5 visits");
  });
});
