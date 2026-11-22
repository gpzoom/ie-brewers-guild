/** Program copy fixed by the owner (spec 2026-11-17). */
export const PROGRAM_NAME = "Inland Scan Pass";

/**
 * The Beer Trail offer's built-in wording. The live wording is set on Guild
 * Settings (site_settings.trail_offer, owner 2026-11-21); this is the
 * database default and the fallback when it can't be read.
 */
export const STANDARD_OFFER = "Your first beer for a nickel";

/** The database checks the same 3–80 characters (site_settings_trail_offer_length). */
export const TRAIL_OFFER_MIN = 3;
export const TRAIL_OFFER_MAX = 80;

/** Spaces collapsed and trimmed; a trailing period dropped (screens add their own). */
export function normalizeTrailOffer(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "")
    .trim();
}

export function validateTrailOffer(value: unknown): { ok: true; value: string } | { ok: false; message: string } {
  const text = normalizeTrailOffer(value);
  if (text.length < TRAIL_OFFER_MIN) return { ok: false, message: "Type the offer, for example “Your first beer for a nickel”." };
  if (text.length > TRAIL_OFFER_MAX) return { ok: false, message: `Keep it to ${TRAIL_OFFER_MAX} characters or fewer.` };
  return { ok: true, value: text };
}

/** For a headline: the offer with a closing period, unless it already ends in ! or ?. */
export function trailOfferHeadline(offer: string): string {
  return /[.!?]$/.test(offer) ? offer : `${offer}.`;
}
