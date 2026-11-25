import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tap-card/plate.server", () => ({}));
vi.mock("@/lib/tap-card/card-view.server", () => ({}));

import { choiceOf, keyOf, waitingRewards } from "./RewardChoices";
import { successUsedLine } from "./PlateSuccess";
import type { BarReward } from "@/lib/tap-card/loyalty";
import type { BarState } from "@/lib/tap-card/bar-core";

const member: BarReward = { kind: "member", id: "r1", reward: "Pint", terms: "", expiresAt: "2027-01-01T00:00:00Z" };
const trail = { kind: "trail", reward: "Nickel beer" } as BarReward;
const earn = { kind: "earn", slot: "step1", reward: "Snack", terms: "" } as BarReward;

describe("reward choices", () => {
  it("round-trips each kind", () => {
    expect(choiceOf(keyOf(member))).toEqual({ kind: "member", id: "r1" });
    expect(choiceOf(keyOf(trail))).toEqual({ kind: "trail" });
    expect(choiceOf(keyOf(earn))).toEqual({ kind: "earn", slot: "step1" });
    expect(choiceOf("none")).toEqual({ kind: "none" });
  });
  it("offers nothing once a reward was used today", () => {
    const state = { used: null, featured: member, others: [trail] } as unknown as BarState;
    expect(waitingRewards(state)).toEqual([member, trail]);
    expect(waitingRewards({ ...state, used: member })).toEqual([]);
  });
});

describe("successUsedLine", () => {
  it("asks staff to pour only for a reward used on this tap", () => {
    expect(successUsedLine("used")).toBe("Used just now. Staff member: please pour.");
    for (const o of [undefined, "already-used-today", "not-available"] as const) expect(successUsedLine(o)).toBe("Already used earlier today.");
  });
  it("says when it was used, in Pacific time", () => {
    expect(successUsedLine(undefined, "2026-11-25T22:05:30Z")).toBe("Already used earlier today at 2:05 PM.");
    expect(successUsedLine("already-used-today", "2026-11-26T04:40:00Z")).toBe("Already used earlier today at 8:40 PM.");
    expect(successUsedLine("used", "2026-11-25T22:05:30Z")).toBe("Used just now. Staff member: please pour.");
    expect(successUsedLine(undefined, null)).toBe("Already used earlier today.");
  });
});
