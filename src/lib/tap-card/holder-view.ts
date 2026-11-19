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
  /** Every visit, any year (for "Your visits"). */
  allVisits: { memberId: string; memberName: string; visitDay: string }[];
  /** Unused, unexpired loyalty rewards. */
  waiting: WaitingReward[];
  /** A Beer Trail Pass is on sale that this holder hasn't bought (spec 2026-11-19). */
  canJoinTrail?: boolean;
};

export type WaitingReward = { memberName: string; reward: string; terms: string; expiresAt: string };

export type HolderCardView = {
  firstName: string;
  year: number;
  stops: { memberId: string; name: string; slug: string; city: string | null; offer: string; visited: boolean; redeemedOn: string | null }[];
  visitedCount: number;
  totalStops: number;
  milestones: { stopsRequired: number; rewardText: string; earned: boolean; handedOut: boolean }[];
  cards: string[];
  waiting: WaitingReward[];
  visitCounts: { memberId: string; name: string; count: number }[];
  canJoinTrail: boolean;
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
    waiting: [...input.waiting].sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)),
    visitCounts: visitCounts(input.allVisits),
    canJoinTrail: input.canJoinTrail ?? false,
  };
}

function visitCounts(visits: HolderViewInput["allVisits"]): HolderCardView["visitCounts"] {
  const counts = new Map<string, { memberId: string; name: string; count: number }>();
  for (const v of visits) {
    const row = counts.get(v.memberId) ?? { memberId: v.memberId, name: v.memberName, count: 0 };
    row.count += 1;
    counts.set(v.memberId, row);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
