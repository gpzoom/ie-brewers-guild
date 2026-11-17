import { tapCardDay, tapCardYear } from "@/lib/tap-card/tap-card-time";

/**
 * The bartender's two buttons: "Record visit" and "Record visit + redeem
 * offer". One visit per holder per brewery per Pacific day; one redemption
 * per holder per brewery per calendar year. The database's unique indexes
 * are the real guard (two bar devices at once, a double tap); a store call
 * that hits one returns "duplicate" and this answers "already recorded"
 * rather than failing.
 */
export type CheckInStore = {
  findVisit(holderId: string, memberId: string, day: string): Promise<{ id: string; redeemedYear: number | null } | null>;
  hasRedeemed(holderId: string, memberId: string, year: number): Promise<{ day: string } | null>;
  insertVisit(v: {
    holderId: string;
    memberId: string;
    cardId: string;
    deviceId: string;
    day: string;
    redeemedYear: number | null;
  }): Promise<"ok" | "duplicate">;
  markRedeemed(visitId: string, year: number): Promise<"ok" | "duplicate">;
};

export type CheckInOutcome =
  | { kind: "recorded"; redeemed: boolean }
  | { kind: "already-visited-today"; redeemed: boolean }
  | { kind: "already-redeemed"; redeemedOn: string; visitRecorded: boolean };

export type CheckInInput = {
  holderId: string;
  memberId: string;
  cardId: string;
  deviceId: string;
  redeem: boolean;
  at: Date;
};

export async function checkInCore(store: CheckInStore, input: CheckInInput): Promise<CheckInOutcome> {
  const { holderId, memberId, cardId, deviceId, redeem, at } = input;
  const day = tapCardDay(at);
  const year = tapCardYear(at);
  const today = await store.findVisit(holderId, memberId, day);

  if (!redeem) {
    if (today) return { kind: "already-visited-today", redeemed: today.redeemedYear !== null };
    const inserted = await store.insertVisit({ holderId, memberId, cardId, deviceId, day, redeemedYear: null });
    return inserted === "ok" ? { kind: "recorded", redeemed: false } : { kind: "already-visited-today", redeemed: false };
  }

  const earlier = await store.hasRedeemed(holderId, memberId, year);
  if (earlier) {
    if (today) return { kind: "already-redeemed", redeemedOn: earlier.day, visitRecorded: false };
    const inserted = await store.insertVisit({ holderId, memberId, cardId, deviceId, day, redeemedYear: null });
    return { kind: "already-redeemed", redeemedOn: earlier.day, visitRecorded: inserted === "ok" };
  }

  if (today) {
    const marked = await store.markRedeemed(today.id, year);
    if (marked === "ok") return { kind: "recorded", redeemed: true };
    const raced = await store.hasRedeemed(holderId, memberId, year);
    return { kind: "already-redeemed", redeemedOn: raced?.day ?? day, visitRecorded: false };
  }

  const inserted = await store.insertVisit({ holderId, memberId, cardId, deviceId, day, redeemedYear: year });
  return inserted === "ok" ? { kind: "recorded", redeemed: true } : { kind: "already-visited-today", redeemed: false };
}

/** What the check-in screen shows before the bartender presses anything. */
export async function redemptionStatus(
  store: CheckInStore,
  holderId: string,
  memberId: string,
  at: Date,
): Promise<{ available: true } | { available: false; redeemedOn: string }> {
  const earlier = await store.hasRedeemed(holderId, memberId, tapCardYear(at));
  return earlier ? { available: false, redeemedOn: earlier.day } : { available: true };
}
