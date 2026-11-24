/**
 * Paid with a different email than the sign-up page's: what to put right once
 * the payer has signed in (emailed code or link) to the card the pass landed
 * on, in the browser that started the sign-up. Pure -- see trail-repair.server.ts.
 */

/** Same clock slack as the return page; the sign-up cookie lasts 2 hours. */
const SLACK_MS = 2 * 60_000;
const WINDOW_MS = 2 * 60 * 60_000;

export type RepairPass = { paymentId: string; paidAt: Date; memberId: string | null; year: number };

export type TrailRepair = {
  paymentId: string;
  /** The brewery to credit, when the sale has none yet. */
  creditTo: string | null;
  /** The brewery whose email box they checked. */
  subscribeTo: string | null;
  /** The Scan Pass they were signed in to when they started: the pass belongs there. */
  moveTo: string | null;
};

export function planTrailRepair(i: {
  join: { email: string; memberId: string | null; optIn: boolean; createdAt: Date };
  /** The card just signed in to: its email is proven. */
  card: { id: string; email: string };
  /** The card this browser was still signed in to before that. */
  previous: { id: string; email: string } | null;
  /** Unrefunded passes on `card`. */
  passes: RepairPass[];
  /** The sign-up email's own card got a pass since the sign-up: nothing was mixed up. */
  joinEmailPaid: boolean;
  /** Years `previous` already has a pass for. */
  previousYears: number[];
  /** Nothing on `card` but passes from one payment, so moving them leaves it empty. */
  onlyThisPayment: boolean;
}): TrailRepair | null {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  if (same(i.join.email, i.card.email) || i.joinEmailPaid) return null;
  const start = i.join.createdAt.getTime();
  const pass = i.passes
    .filter((p) => p.paidAt.getTime() >= start - SLACK_MS && p.paidAt.getTime() <= start + WINDOW_MS)
    .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())[0];
  if (!pass) return null;
  // Already another brewery's sale: not this sign-up's payment.
  if (pass.memberId !== null && pass.memberId !== i.join.memberId) return null;
  const moveTo =
    i.previous && i.previous.id !== i.card.id && same(i.previous.email, i.join.email) && !i.previousYears.includes(pass.year) && i.onlyThisPayment
      ? i.previous.id
      : null;
  return {
    paymentId: pass.paymentId,
    creditTo: pass.memberId === null ? i.join.memberId : null,
    subscribeTo: i.join.optIn ? i.join.memberId : null,
    moveTo,
  };
}
