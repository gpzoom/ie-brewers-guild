import { passLines, type ZeffyPayment } from "@/lib/tap-card/zeffy";

/**
 * A Zeffy payment becomes Beer Trail Passes (spec 2026-11-19). The webhook and
 * the return page both call this; the (payment, item) unique key makes a
 * second call harmless. Each pass is credited to the brewery of the newest
 * counter-plate sign-up with the same email made before the payment.
 */
export type TrailPassStore = {
  campaignByZeffyId(id: string): Promise<{ year: number } | null>;
  findHolderByEmail(email: string): Promise<{ id: string; createdAt: string } | null>;
  createHolder(h: { name: string; email: string }): Promise<{ id: string }>;
  latestJoin(email: string, before: Date): Promise<{ id: string; memberId: string | null; optIn: boolean } | null>;
  insertPass(p: {
    paymentId: string;
    itemId: string;
    holderId: string;
    memberId: string | null;
    year: number;
    amountCents: number;
    paidAt: Date;
  }): Promise<"ok" | "duplicate">;
  hasPayment(paymentId: string): Promise<boolean>;
  markRefunded(paymentId: string, at: Date): Promise<void>;
  addSubscriber(memberId: string, holderId: string, at: Date): Promise<void>;
};

export type RecordedPass = { itemId: string; holderId: string; email: string; holderExisted: boolean; memberId: string | null };
export type RecordResult = { kind: "ignored" } | { kind: "refunded" } | { kind: "recorded"; passes: RecordedPass[] };

/** A sign-up counts if it was made up to 5 minutes after Zeffy stamped the payment (clock slack). */
const JOIN_SLACK_MS = 5 * 60_000;

export async function recordZeffyPayment(store: TrailPassStore, p: ZeffyPayment, now: Date): Promise<RecordResult> {
  const campaign = await store.campaignByZeffyId(p.campaignId);
  if (!campaign) return { kind: "ignored" };
  if (p.refunded) {
    await store.markRefunded(p.id, now);
    return { kind: "refunded" };
  }
  if (!p.succeeded) return { kind: "ignored" };

  const lines = passLines(p).filter((l) => l.email);
  // The whole payment was started at one counter: find that sign-up by any pass's email, then the buyer's.
  const before = new Date(p.createdAt.getTime() + JOIN_SLACK_MS);
  let join: { email: string; memberId: string | null; optIn: boolean } | null = null;
  for (const email of [...lines.map((l) => l.email), p.buyer.email].filter(Boolean)) {
    const found = await store.latestJoin(email, before);
    if (found) {
      join = { email: email.toLowerCase(), memberId: found.memberId, optIn: found.optIn };
      break;
    }
  }
  const memberId = join?.memberId ?? null;

  const passes: RecordedPass[] = [];
  for (const line of lines) {
    const found = await store.findHolderByEmail(line.email);
    const holderId = found?.id ?? (await store.createHolder({ name: line.name || line.email, email: line.email })).id;
    const holderExisted = found !== null && new Date(found.createdAt).getTime() < p.createdAt.getTime();
    await store.insertPass({ paymentId: p.id, itemId: line.itemId, holderId, memberId, year: campaign.year, amountCents: line.amountCents, paidAt: p.createdAt });
    // Only the person who checked the box on the sign-up page is subscribed.
    if (join?.optIn && memberId && join.email === line.email.toLowerCase()) await store.addSubscriber(memberId, holderId, now);
    passes.push({ itemId: line.itemId, holderId, email: line.email, holderExisted, memberId });
  }
  return { kind: "recorded", passes };
}

/** Zeffy no longer has this payment (deleted): its passes are off. Only ever removes access. */
export async function recordMissingPayment(store: TrailPassStore, paymentId: string, now: Date): Promise<{ kind: "ignored" } | { kind: "refunded" }> {
  if (!(await store.hasPayment(paymentId))) return { kind: "ignored" };
  await store.markRefunded(paymentId, now);
  return { kind: "refunded" };
}

/** Beer Trail rewards need an unrefunded pass for that exact trail year. */
export async function hasTrailPass(store: { passYears(holderId: string): Promise<number[]> }, holderId: string, year: number): Promise<boolean> {
  return (await store.passYears(holderId)).includes(year);
}

export type JoinedView =
  | { kind: "no-join" }
  | { kind: "waiting" }
  | { kind: "signed-in"; holderId: string; next: string }
  | { kind: "need-code"; email: string; next: string };

/** Clock slack between our sign-up time and Zeffy's payment time. */
const CLAIM_SLACK_MS = 2 * 60_000;

/**
 * Back from Zeffy. This browser is signed in at once only when it is clearly
 * the payer: the card is brand new, the payment came after this browser's
 * sign-up, and no other sign-up used that email around the payment (someone
 * who merely typed a new customer's email gets the emailed code instead).
 * A cardholder already signed in to that card on this phone just goes back.
 */
export function decideJoinedView(i: {
  join: { email: string; memberId: string | null; plateCode: string | null; createdAt: Date } | null;
  recorded: RecordedPass[] | null;
  claim: { paymentAt: Date; otherJoins: number } | null;
  currentHolderId: string | null;
}): JoinedView {
  if (!i.join) return { kind: "no-join" };
  if (!i.recorded || !i.claim) return { kind: "waiting" };
  const next = i.join.plateCode ? `/t/${i.join.plateCode}` : "/card";
  const mine = i.recorded.find((p) => p.email.toLowerCase() === i.join!.email.toLowerCase());
  if (mine && i.currentHolderId === mine.holderId) return { kind: "signed-in", holderId: mine.holderId, next };
  const paidAfterJoin = i.claim.paymentAt.getTime() >= i.join.createdAt.getTime() - CLAIM_SLACK_MS;
  if (mine && !mine.holderExisted && paidAfterJoin && i.claim.otherJoins === 0) return { kind: "signed-in", holderId: mine.holderId, next };
  return { kind: "need-code", email: i.join.email, next };
}
