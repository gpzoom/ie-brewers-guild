import { describe, expect, it } from "vitest";
import { buildHolderView, type HolderViewInput } from "./holder-view";

const input = (over: Partial<HolderViewInput> = {}): HolderViewInput => ({
  holderName: "Pat Tester",
  year: 2026,
  stops: [
    { memberId: "a", name: "Zeta Brewing", slug: "zeta", city: "Riverside", offer: "Your first beer for a nickel" },
    { memberId: "b", name: "Alpha Ales", slug: "alpha", city: "Ontario", offer: "Free flight" },
    { memberId: "c", name: "Mid Brewing", slug: "mid", city: "Corona", offer: "Your first beer for a nickel" },
  ],
  visits: [
    { memberId: "a", visitDay: "2026-03-01", redeemedYear: 2026 },
    { memberId: "a", visitDay: "2026-04-01", redeemedYear: null },
    { memberId: "b", visitDay: "2025-12-31", redeemedYear: 2025 },
    { memberId: "gone", visitDay: "2026-05-01", redeemedYear: null },
  ],
  milestones: [
    { id: "m2", stopsRequired: 2, rewardText: "Sticker" },
    { id: "m1", stopsRequired: 1, rewardText: "Pin" },
  ],
  rewards: [{ milestoneId: "m1", year: 2026, handedOutAt: null }],
  cards: ["ABCD2345"],
  allVisits: [],
  waiting: [],
  ...over,
});

describe("buildHolderView", () => {
  it("offers to join the Beer Trail only when told a pass is on sale and not yet bought", () => {
    expect(buildHolderView(input()).canJoinTrail).toBe(false);
    expect(buildHolderView({ ...input(), canJoinTrail: true }).canJoinTrail).toBe(true);
  });
  it("knows whether the Beer Trail is unlocked on this card (loyalty-only cards hide trail progress)", () => {
    expect(buildHolderView(input()).hasTrailPass).toBe(false);
    expect(buildHolderView({ ...input(), hasTrailPass: true }).hasTrailPass).toBe(true);
  });
  it("uses the first name and formats the cards", () => {
    const view = buildHolderView(input());
    expect(view.firstName).toBe("Pat");
    expect(view.cards).toEqual(["ABCD-2345"]);
    expect(view.year).toBe(2026);
  });

  it("only this year's visits count, and only current stops are listed", () => {
    const view = buildHolderView(input());
    expect(view.totalStops).toBe(3);
    // "gone" (no longer a stop) still counts toward this year's distinct stops.
    expect(view.visitedCount).toBe(2);
    expect(view.stops.map((s) => s.memberId)).toEqual(["b", "c", "a"]);
    expect(view.stops.find((s) => s.memberId === "a")).toMatchObject({ visited: true, redeemedOn: "2026-03-01" });
    expect(view.stops.find((s) => s.memberId === "b")).toMatchObject({ visited: false, redeemedOn: null });
  });

  it("lists milestones smallest first with earned and handed-out state", () => {
    expect(buildHolderView(input()).milestones).toEqual([
      { stopsRequired: 1, rewardText: "Pin", earned: true, handedOut: false },
      { stopsRequired: 2, rewardText: "Sticker", earned: false, handedOut: false },
    ]);
  });
});

describe("loyalty on the card page", () => {
  it("lists waiting rewards soonest-expiring first", () => {
    const view = buildHolderView(
      input({
        waiting: [
          { memberName: "Zeta Brewing", reward: "Glass", terms: "", expiresAt: "2026-09-01T00:00:00.000Z" },
          { memberName: "Alpha Ales", reward: "Pretzel", terms: "Food only", expiresAt: "2026-07-01T00:00:00.000Z" },
        ],
      }),
    );
    expect(view.waiting.map((w) => w.reward)).toEqual(["Pretzel", "Glass"]);
  });

  it("counts visits at each brewery across every year, most first", () => {
    const view = buildHolderView(
      input({
        allVisits: [
          { memberId: "b", memberName: "Alpha Ales", visitDay: "2025-12-31" },
          { memberId: "a", memberName: "Zeta Brewing", visitDay: "2026-03-01" },
          { memberId: "a", memberName: "Zeta Brewing", visitDay: "2026-04-01" },
          { memberId: "c", memberName: "Mid Brewing", visitDay: "2026-04-02" },
        ],
      }),
    );
    expect(view.visitCounts).toEqual([
      { memberId: "a", name: "Zeta Brewing", count: 2 },
      { memberId: "b", name: "Alpha Ales", count: 1 },
      { memberId: "c", name: "Mid Brewing", count: 1 },
    ]);
  });
});
