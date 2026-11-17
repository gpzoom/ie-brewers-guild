import { formatCardCode } from "@/lib/tap-card/card-code";
import { firstNameOf } from "@/lib/tap-card/card-view";

/**
 * The holder's /card page: this calendar year's progress. Visits from past
 * years don't count; a brewery that's no longer a stop isn't listed, but a
 * visit there this year still counts (as it did for the milestone).
 */
export type HolderViewInput = {
  holderName: string;
  year: number;
  stops: { memberId: string; name: string; slug: string; city: string | null; offer: string }[];
  visits: { memberId: string; visitDay: string; redeemedYear: number | null }[];
  milestones: { id: string; stopsRequired: number; rewardText: string }[];
  rewards: { milestoneId: string; year: number; handedOutAt: string | null }[];
  cards: string[];
};

export type HolderCardView = {
  firstName: string;
  year: number;
  stops: { memberId: string; name: string; slug: string; city: string | null; offer: string; visited: boolean; redeemedOn: string | null }[];
  visitedCount: number;
  totalStops: number;
  milestones: { stopsRequired: number; rewardText: string; earned: boolean; handedOut: boolean }[];
  cards: string[];
};

export function buildHolderView(input: HolderViewInput): HolderCardView {
  const prefix = `${input.year}-`;
  const thisYear = input.visits.filter((v) => v.visitDay.startsWith(prefix));
  const visited = new Set(thisYear.map((v) => v.memberId));
  const redeemedOn = new Map<string, string>();
  for (const v of thisYear) if (v.redeemedYear === input.year) redeemedOn.set(v.memberId, v.visitDay);

  const stops = input.stops
    .map((s) => ({ ...s, visited: visited.has(s.memberId), redeemedOn: redeemedOn.get(s.memberId) ?? null }))
    .sort((a, b) => Number(a.visited) - Number(b.visited) || a.name.localeCompare(b.name));

  const rewards = new Map(input.rewards.filter((r) => r.year === input.year).map((r) => [r.milestoneId, r]));
  const milestones = [...input.milestones]
    .sort((a, b) => a.stopsRequired - b.stopsRequired)
    .map((m) => ({
      stopsRequired: m.stopsRequired,
      rewardText: m.rewardText,
      earned: rewards.has(m.id),
      handedOut: Boolean(rewards.get(m.id)?.handedOutAt),
    }));

  return {
    firstName: firstNameOf(input.holderName),
    year: input.year,
    stops,
    visitedCount: visited.size,
    totalStops: input.stops.length,
    milestones,
    cards: input.cards.map(formatCardCode),
  };
}
