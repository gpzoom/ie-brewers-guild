import type { TapCardOfferSlot } from "@/lib/supabase/types";
import { STANDARD_OFFER } from "@/lib/tap-card/tap-card-copy";

/**
 * Loyalty rewards (spec 2026-11-17-tap-card-offers-loyalty-design.md).
 * After the Beer Trail offer (visit 1), a brewery offers up to 3 steps
 * ("on visit #N") and one repeating reward ("every N visits"). Visit numbers
 * count every visit a person has made at that brewery, ever. A step is earned
 * once per person; the repeating reward on every Nth visit.
 */
export type OfferSlot = TapCardOfferSlot;
export const STEP_SLOTS: readonly OfferSlot[] = ["step1", "step2", "step3"];
export const EXPIRY_CHOICES = [30, 60, 90, 365] as const;
export const DEFAULT_EXPIRY_DAYS = 90;
export const REWARD_MIN = 3;
export const REWARD_MAX = 140;
export const TERMS_MAX = 300;
export const TEMPLATE_TITLE_MAX = 60;

export type LiveOffer = { slot: OfferSlot; visitNumber: number; reward: string; terms: string };
export type OfferInput = { slot: OfferSlot; visitNumber: number; reward: string; terms: string };

const tidy = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim();

function checkRewardAndTerms(rewardRaw: string, termsRaw: string): { ok: true; reward: string; terms: string } | { ok: false; message: string } {
  const reward = tidy(rewardRaw);
  const terms = tidy(termsRaw);
  if (reward.length < REWARD_MIN) return { ok: false, message: `Write at least ${REWARD_MIN} characters.` };
  if (reward.length > REWARD_MAX) return { ok: false, message: `Keep the reward to ${REWARD_MAX} characters or fewer.` };
  if (terms.length > TERMS_MAX) return { ok: false, message: `Keep the terms to ${TERMS_MAX} characters or fewer.` };
  return { ok: true, reward, terms };
}

/** otherStepNumbers: visit numbers the brewery's other steps already use (ignored for the repeating reward). */
export function validateMemberOffer(
  input: OfferInput,
  otherStepNumbers: number[],
): { ok: true; value: OfferInput } | { ok: false; message: string } {
  const n = Number(input.visitNumber);
  if (!Number.isInteger(n)) return { ok: false, message: "Use a whole number." };
  if (input.slot === "repeat") {
    if (n < 2) return { ok: false, message: "Pick every 2 visits or more." };
  } else {
    if (n < 2) return { ok: false, message: "Visit numbers start at 2 — visit 1 is the Beer Trail offer." };
    if (otherStepNumbers.includes(n)) return { ok: false, message: `Another step already uses visit ${n}.` };
  }
  const text = checkRewardAndTerms(input.reward, input.terms);
  if (!text.ok) return text;
  return { ok: true, value: { slot: input.slot, visitNumber: n, reward: text.reward, terms: text.terms } };
}

/** What a visit earns: steps first (in slot order), then the repeating reward. */
export function earnedOnVisit(
  visitNumber: number,
  live: LiveOffer[],
  stepsAlreadyEarned: Set<OfferSlot>,
): { slot: OfferSlot; reward: string; terms: string }[] {
  const steps = live
    .filter((o) => o.slot !== "repeat" && o.visitNumber === visitNumber && !stepsAlreadyEarned.has(o.slot))
    .sort((a, b) => a.slot.localeCompare(b.slot));
  const repeat = live.filter((o) => o.slot === "repeat" && o.visitNumber >= 2 && visitNumber % o.visitNumber === 0);
  return [...steps, ...repeat].map((o) => ({ slot: o.slot, reward: o.reward, terms: o.terms }));
}

export function expiresAt(earnedAt: Date, days: number): Date {
  return new Date(earnedAt.getTime() + days * 24 * 60 * 60 * 1000);
}

export type BarReward =
  | { kind: "trail"; reward: string }
  | { kind: "member"; id: string; reward: string; terms: string; expiresAt: string };

export type BankedReward = { id: string; reward: string; terms: string; expiresAt: string; earnedAt: string };

/** The one reward the bar screen features: the Beer Trail offer first, then the soonest to expire. */
export function pickBarRewards(input: {
  trailAvailable: boolean;
  banked: BankedReward[];
  now: Date;
}): { featured: BarReward | null; others: BarReward[] } {
  const waiting: BarReward[] = input.banked
    .filter((r) => new Date(r.expiresAt).getTime() > input.now.getTime())
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.earnedAt.localeCompare(b.earnedAt))
    .map((r) => ({ kind: "member", id: r.id, reward: r.reward, terms: r.terms, expiresAt: r.expiresAt }));
  const all: BarReward[] = input.trailAvailable ? [{ kind: "trail", reward: STANDARD_OFFER }, ...waiting] : waiting;
  return { featured: all[0] ?? null, others: all.slice(1) };
}

export function offerLabel(slot: OfferSlot, visitNumber: number): string {
  return slot === "repeat" ? `Every ${visitNumber} visits` : `Visit ${visitNumber}`;
}
