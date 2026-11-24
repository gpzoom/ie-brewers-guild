/** Joining the Beer Trail from a counter plate (spec 2026-11-19). Pure helpers. */

export const TRAIL_JOIN_COOKIE = "iebg_trailjoin";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function joinPageUrl(plateCode: string | null): string {
  return plateCode ? `/trail/join?plate=${encodeURIComponent(plateCode)}` : "/trail/join";
}

export function validateTrailJoin(i: { email: string; ageConfirmed: boolean }): Partial<Record<"email" | "ageConfirmed", string>> {
  const errors: Partial<Record<"email" | "ageConfirmed", string>> = {};
  if (!EMAIL_PATTERN.test(i.email.trim()) || i.email.length > 254) errors.email = "Enter a valid email address.";
  if (!i.ageConfirmed) errors.ageConfirmed = "You must be 21 or older to join.";
  return errors;
}

/** The return page checks for the payment this many times, this far apart... */
export const JOINED_TRIES = 12;
export const JOINED_EVERY_MS = 5000;
/** ...and offers "did you use a different email?" from this long on, still checking. */
const EMAIL_HELP_AFTER_MS = 15_000;

/** After `tries` checks found nothing (the first is at 0 seconds). */
export function joinedWaitStep(tries: number): { checkAgain: boolean; emailHelp: boolean } {
  return { checkAgain: tries < JOINED_TRIES, emailHelp: (tries - 1) * JOINED_EVERY_MS >= EMAIL_HELP_AFTER_MS };
}

/** The pass on sale: the soonest trail year (with a Zeffy campaign) that hasn't ended. */
export function activeCampaignYear(years: number[], currentYear: number): number | null {
  const open = years.filter((y) => y >= currentYear).sort((a, b) => a - b);
  return open[0] ?? null;
}
