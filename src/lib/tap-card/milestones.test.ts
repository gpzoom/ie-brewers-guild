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

describe("validateMilestone", () => {
  it("needs a whole number of stops from 1 to 100 and reward text", async () => {
    const { validateMilestone } = await import("./milestones");
    expect(validateMilestone({ stopsRequired: 5, rewardText: "  Guild sticker " })).toEqual({
      ok: true,
      value: { stopsRequired: 5, rewardText: "Guild sticker" },
    });
    expect(validateMilestone({ stopsRequired: 0, rewardText: "x" })).toEqual({ ok: false, message: "Stops must be a whole number from 1 to 100." });
    expect(validateMilestone({ stopsRequired: 2.5, rewardText: "x" })).toEqual({ ok: false, message: "Stops must be a whole number from 1 to 100." });
    expect(validateMilestone({ stopsRequired: 3, rewardText: " " })).toEqual({ ok: false, message: "Describe the reward." });
    expect(validateMilestone({ stopsRequired: 3, rewardText: "x".repeat(141) })).toEqual({
      ok: false,
      message: "Keep the reward to 140 characters or fewer.",
    });
  });
});
