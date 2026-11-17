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
