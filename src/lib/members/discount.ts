/**
 * Pure rules for the Allied Member discount (spec, "Allied Member
 * discount"). Shared by DiscountEditor.tsx's optimistic state and the draft
 * save validator (src/lib/drafts/validate-patch.ts), so the client copy
 * can't drift from what's actually saved.
 */

export type DiscountFields = {
  discount_percent: number | null;
  discount_no_fixed_percent: boolean;
  discount_redeem_text: string | null;
};

export type DiscountPatch = Partial<DiscountFields>;

const MIN_DISCOUNT_PERCENT = 0;
const MAX_DISCOUNT_PERCENT = 100;

/**
 * discount_percent is a smallint with no CHECK constraint on the live
 * table, and the number input's min/max are client-side only. It renders
 * large near the top of the public profile, so a garbage value would be a
 * very visible bug. `null` (clearing it) and `undefined` (not in the patch)
 * are fine.
 */
export function assertValidDiscountPercent(value: number | null | undefined): void {
  if (typeof value !== "number") return;
  if (!Number.isFinite(value) || value < MIN_DISCOUNT_PERCENT || value > MAX_DISCOUNT_PERCENT) {
    throw new Error(
      `Discount percentage must be between ${MIN_DISCOUNT_PERCENT} and ${MAX_DISCOUNT_PERCENT}.`,
    );
  }
}

/**
 * Percent XOR "no fixed percentage": setting discount_no_fixed_percent true
 * clears discount_percent in the same patch, and a numeric percent clears
 * the flag -- never both at once. DiscountEditor applies this to its own
 * local copy too; otherwise its uncontrolled percent input could redisplay
 * a stale number and a plain blur would resurrect it.
 */
export function applyDiscountXor<T extends DiscountPatch>(patch: T): T {
  const next = { ...patch };
  if (next.discount_no_fixed_percent === true) next.discount_percent = null;
  if (typeof next.discount_percent === "number") next.discount_no_fixed_percent = false;
  return next;
}
