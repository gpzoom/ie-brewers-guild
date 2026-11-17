import { describe, expect, it } from "vitest";
import { newlyEarned, type Milestone } from "./milestones";

const five: Milestone = { id: "m5", stopsRequired: 5, rewardText: "Sticker" };
const ten: Milestone = { id: "m10", stopsRequired: 10, rewardText: "Glass" };

describe("newlyEarned", () => {
  it("earns a milestone when the stop count reaches it", () => {
    expect(newlyEarned([ten, five], 5, new Set())).toEqual([five]);
  });
  it("doesn't earn one twice", () => {
    expect(newlyEarned([five, ten], 5, new Set(["m5"]))).toEqual([]);
  });
  it("earns several at once, smallest first", () => {
    expect(newlyEarned([ten, five], 12, new Set())).toEqual([five, ten]);
  });
  it("earns nothing below the first milestone", () => {
    expect(newlyEarned([five], 4, new Set())).toEqual([]);
  });
});
