import { earnedOnVisit, expiresAt, pickBarRewards, type BarReward, type LiveOffer, type OfferSlot } from "@/lib/tap-card/loyalty";
import { STANDARD_OFFER } from "@/lib/tap-card/tap-card-copy";
import { tapCardDay, tapCardYear } from "@/lib/tap-card/tap-card-time";

/**
 * The bar, at a bar device or a counter plate (spec 2026-11-17 offers &
 * loyalty). Opening a card records the visit -- one per person per brewery
 * per Pacific day -- and earns any loyalty reward that visit number unlocks.
 * Then at most one reward is used per visit: the Beer Trail offer (once a
 * calendar year) or one banked loyalty reward. Undo works for today's visit
 * only. The database's unique indexes are the real guard against a double tap
 * or two devices at once; a store call that hits one says "duplicate"/"taken".
 */
export type BarStore = {
  findVisit(holderId: string, memberId: string, day: string): Promise<{ id: string; redeemedYear: number | null } | null>;
  insertVisit(v: { holderId: string; memberId: string; cardId: string | null; deviceId: string | null; day: string }): Promise<"ok" | "duplicate">;
  countVisits(holderId: string, memberId: string): Promise<number>;
  /** A Beer Trail stop (producer on the trail). Other members give loyalty only (universal card). */
  isTrailStop(memberId: string): Promise<boolean>;
  /** A paid, unrefunded Beer Trail Pass for that trail year (spec 2026-11-19). Loyalty never needs one. */
  hasTrailPass(holderId: string, year: number): Promise<boolean>;
  trailRedeemedIn(holderId: string, memberId: string, year: number): Promise<{ visitId: string; day: string } | null>;
  setTrailRedeemed(visitId: string, year: number | null): Promise<"ok" | "duplicate">;
  liveOffers(memberId: string): Promise<LiveOffer[]>;
  stepsEarned(holderId: string, memberId: string): Promise<Set<OfferSlot>>;
  expiryDays(memberId: string): Promise<number>;
  insertEarned(r: {
    holderId: string;
    memberId: string;
    slot: OfferSlot;
    reward: string;
    terms: string;
    visitId: string;
    earnedAt: Date;
    expiresAt: Date;
  }): Promise<"ok" | "duplicate">;
  banked(
    holderId: string,
    memberId: string,
  ): Promise<{ id: string; reward: string; terms: string; expiresAt: string; earnedAt: string; slot: OfferSlot; visitId: string }[]>;
  memberRewardUsedOn(visitId: string): Promise<{ id: string; reward: string; terms: string; expiresAt: string } | null>;
  markUsed(rewardId: string, visitId: string, deviceId: string | null, at: Date): Promise<"ok" | "taken">;
  clearUse(rewardId: string, visitId: string): Promise<void>;
};

export type BarState = {
  visitNumber: number;
  firstToday: boolean;
  used: BarReward | null;
  featured: BarReward | null;
  others: BarReward[];
  newlyEarned: string[];
};

/** cardId/deviceId are null at a counter plate (the customer's own phone). */
export type VisitInput = { holderId: string; memberId: string; cardId: string | null; deviceId: string | null; at: Date };
/** "earn": the reward this very visit earns, used right away (picked before check-in). */
export type RewardChoice = { kind: "trail" } | { kind: "member"; id: string } | { kind: "earn"; slot: OfferSlot };

async function usedOn(store: BarStore, visit: { id: string; redeemedYear: number | null }): Promise<BarReward | null> {
  if (visit.redeemedYear !== null) return { kind: "trail", reward: STANDARD_OFFER };
  const member = await store.memberRewardUsedOn(visit.id);
  return member ? { kind: "member", ...member } : null;
}

export async function barState(store: BarStore, input: VisitInput & { firstToday: boolean; newlyEarned: string[] }): Promise<BarState> {
  const { holderId, memberId, at } = input;
  const [today, visitNumber] = await Promise.all([store.findVisit(holderId, memberId, tapCardDay(at)), store.countVisits(holderId, memberId)]);
  const used = today ? await usedOn(store, today) : null;
  const base = { visitNumber, firstToday: input.firstToday, used, newlyEarned: input.newlyEarned };
  if (used) return { ...base, featured: null, others: [] };
  const year = tapCardYear(at);
  const [stop, pass, trail, banked] = await Promise.all([
    store.isTrailStop(memberId),
    store.hasTrailPass(holderId, year),
    store.trailRedeemedIn(holderId, memberId, year),
    store.banked(holderId, memberId),
  ]);
  // Not checked in yet: also offer what this visit will earn, so it can be used right away.
  let earnNow: { slot: OfferSlot; reward: string; terms: string }[] = [];
  if (!today) {
    const [live, steps] = await Promise.all([store.liveOffers(memberId), store.stepsEarned(holderId, memberId)]);
    earnNow = earnedOnVisit(visitNumber + 1, live, steps);
  }
  return { ...base, ...pickBarRewards({ trailAvailable: stop && pass && !trail, banked, now: at, earnNow }) };
}

export async function checkInVisit(store: BarStore, input: VisitInput): Promise<BarState> {
  const { holderId, memberId, cardId, deviceId, at } = input;
  const day = tapCardDay(at);
  const existing = await store.findVisit(holderId, memberId, day);
  if (existing) return barState(store, { ...input, firstToday: false, newlyEarned: [] });
  const inserted = await store.insertVisit({ holderId, memberId, cardId, deviceId, day });
  const visit = await store.findVisit(holderId, memberId, day);
  if (inserted !== "ok" || !visit) return barState(store, { ...input, firstToday: false, newlyEarned: [] });

  const [visitNumber, live, steps, days] = await Promise.all([
    store.countVisits(holderId, memberId),
    store.liveOffers(memberId),
    store.stepsEarned(holderId, memberId),
    store.expiryDays(memberId),
  ]);
  const newlyEarned: string[] = [];
  for (const r of earnedOnVisit(visitNumber, live, steps)) {
    const result = await store.insertEarned({ holderId, memberId, ...r, visitId: visit.id, earnedAt: at, expiresAt: expiresAt(at, days) });
    if (result === "ok") newlyEarned.push(r.reward);
  }
  return barState(store, { ...input, firstToday: true, newlyEarned });
}

export async function useBarReward(
  store: BarStore,
  input: VisitInput & { choice: RewardChoice },
): Promise<{ outcome: "used" | "already-used-today" | "not-available"; state: BarState }> {
  const { holderId, memberId, deviceId, at, choice } = input;
  const state = () => barState(store, { ...input, firstToday: false, newlyEarned: [] });
  const today = await store.findVisit(holderId, memberId, tapCardDay(at));
  if (!today) return { outcome: "not-available", state: await state() };
  if (await usedOn(store, today)) return { outcome: "already-used-today", state: await state() };

  if (choice.kind === "trail") {
    if (!(await store.isTrailStop(memberId))) return { outcome: "not-available", state: await state() };
    if (!(await store.hasTrailPass(holderId, tapCardYear(at)))) return { outcome: "not-available", state: await state() };
    if (await store.trailRedeemedIn(holderId, memberId, tapCardYear(at))) return { outcome: "not-available", state: await state() };
    const result = await store.setTrailRedeemed(today.id, tapCardYear(at));
    return { outcome: result === "ok" ? "used" : "not-available", state: await state() };
  }

  const bankedNow = await store.banked(holderId, memberId);
  // "earn": the reward today's visit just earned (recorded at check-in a moment ago).
  const reward = choice.kind === "earn" ? bankedNow.find((r) => r.slot === choice.slot && r.visitId === today.id) : bankedNow.find((r) => r.id === choice.id);
  if (!reward || new Date(reward.expiresAt).getTime() <= at.getTime()) return { outcome: "not-available", state: await state() };
  const result = await store.markUsed(reward.id, today.id, deviceId, at);
  return { outcome: result === "ok" ? "used" : "already-used-today", state: await state() };
}

export async function undoBarReward(
  store: BarStore,
  input: VisitInput,
): Promise<{ outcome: "undone" | "nothing-to-undo"; state: BarState }> {
  const { holderId, memberId, at } = input;
  const state = () => barState(store, { ...input, firstToday: false, newlyEarned: [] });
  const today = await store.findVisit(holderId, memberId, tapCardDay(at));
  const used = today ? await usedOn(store, today) : null;
  if (!today || !used) return { outcome: "nothing-to-undo", state: await state() };
  if (used.kind === "trail") await store.setTrailRedeemed(today.id, null);
  else if (used.kind === "member") await store.clearUse(used.id, today.id);
  return { outcome: "undone", state: await state() };
}
