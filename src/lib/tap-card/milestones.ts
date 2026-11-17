/**
 * Guild milestone rewards: distinct stops visited in the current calendar
 * year (spec, "Rewards"). Visits only -- never beers bought.
 */
export type Milestone = { id: string; stopsRequired: number; rewardText: string };

/** Milestones reached by this stop count and not already earned this year, smallest first. */
export function newlyEarned(milestones: Milestone[], distinctStopsThisYear: number, alreadyEarnedIds: Set<string>): Milestone[] {
  return milestones
    .filter((m) => m.stopsRequired <= distinctStopsThisYear && !alreadyEarnedIds.has(m.id))
    .sort((a, b) => a.stopsRequired - b.stopsRequired);
}

export const MILESTONE_MAX_STOPS = 100;
export const REWARD_TEXT_MAX = 140;

/** A Guild milestone as typed on Guild > Tap Card > Milestones. */
export function validateMilestone(input: { stopsRequired: unknown; rewardText: unknown }):
  | { ok: true; value: { stopsRequired: number; rewardText: string } }
  | { ok: false; message: string } {
  const stops = input.stopsRequired;
  if (typeof stops !== "number" || !Number.isInteger(stops) || stops < 1 || stops > MILESTONE_MAX_STOPS) {
    return { ok: false, message: `Stops must be a whole number from 1 to ${MILESTONE_MAX_STOPS}.` };
  }
  const rewardText = String(input.rewardText ?? "").replace(/\s+/g, " ").trim();
  if (!rewardText) return { ok: false, message: "Describe the reward." };
  if (rewardText.length > REWARD_TEXT_MAX) return { ok: false, message: `Keep the reward to ${REWARD_TEXT_MAX} characters or fewer.` };
  return { ok: true, value: { stopsRequired: stops, rewardText } };
}
