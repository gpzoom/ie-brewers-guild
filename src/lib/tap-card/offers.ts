import { STANDARD_OFFER } from "@/lib/tap-card/tap-card-copy";
import type { TapCardOfferStatus } from "@/lib/supabase/types";

/**
 * A stop's offer: the standard "Your first beer for a nickel", or the
 * brewer's own text once a Guild admin approves it (owner, 2026-11-17).
 * Pending or declined → the standard offer shows.
 */
export type OfferState = { offerText: string; status: TapCardOfferStatus } | null;

export function effectiveOffer(row: OfferState): string {
  return row?.status === "approved" ? row.offerText : STANDARD_OFFER;
}

export const OFFER_MIN = 3;
export const OFFER_MAX = 140;

export function validateOfferText(raw: string): { ok: true; text: string } | { ok: false; message: string } {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (text.length < OFFER_MIN) return { ok: false, message: `Write at least ${OFFER_MIN} characters.` };
  if (text.length > OFFER_MAX) return { ok: false, message: `Keep the offer to ${OFFER_MAX} characters or fewer.` };
  return { ok: true, text };
}
