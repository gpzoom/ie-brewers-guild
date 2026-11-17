/**
 * The 21+ age check (owner, 2026-11-17; Brewers Association Digital Media
 * Guidelines: date of birth at the entry to the website). The birth date is
 * checked in the browser and never stored or sent: the cookie only records
 * "confirmed", for one year.
 */

export const AGE_COOKIE = "iebg_age_ok";
export const AGE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
export const LEGAL_DRINKING_AGE = 21;

/** The cookie a confirmed visitor gets (Secure on https). */
export function ageCookieString(secure: boolean): string {
  return `${AGE_COOKIE}=1; Max-Age=${AGE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/**
 * Pages that never ask: the member and Guild screens, sign-in and every
 * emailed link (sign-in, photo sharing, visits, unsubscribe), the Join
 * applicant's step 2, maintenance, and the Terms and Privacy pages.
 */
const OPEN_PREFIXES = [
  "/signin",
  "/portal",
  "/admin",
  "/guild",
  "/auth",
  "/send",
  "/visit",
  "/unsubscribe",
  "/api",
  "/join/finish",
  "/maintenance",
  "/terms",
  "/privacy",
];

export function ageGateApplies(pathname: string, state: { confirmed: boolean; crawler: boolean }): boolean {
  if (state.confirmed || state.crawler) return false;
  const path = pathname.replace(/\/+$/, "") || "/";
  return !OPEN_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Search engines and link-preview fetchers, so listings and shared links keep working. */
const CRAWLER =
  /bot\b|crawler|spider|slurp|googlebot|bingbot|duckduckbot|baiduspider|yandex|facebookexternalhit|facebookcatalog|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|pinterest|applebot|embedly|quora link preview|redditbot|skypeuripreview|vkshare|w3c_validator|google-inspectiontool|lighthouse/i;

export function isCrawler(userAgent: string | null | undefined): boolean {
  return !!userAgent && CRAWLER.test(userAgent);
}

export type BirthDateInput = { month: string; day: string; year: string };

/** "ok" (21 or older), "under", or "invalid" (missing, impossible or future date). */
export function checkBirthDate(input: BirthDateInput, today: Date = new Date()): "ok" | "under" | "invalid" {
  const parse = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);
  const month = parse(input.month);
  const day = parse(input.day);
  const year = parse(input.year);
  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year)) return "invalid";
  if (input.year.trim().length !== 4 || year < 1900) return "invalid";
  const born = new Date(year, month - 1, day);
  if (born.getFullYear() !== year || born.getMonth() !== month - 1 || born.getDate() !== day) return "invalid";
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (born > now) return "invalid";
  // The 21st birthday; a Feb 29 birthday rolls to March 1 in a non-leap year.
  const turns = new Date(year + LEGAL_DRINKING_AGE, month - 1, day);
  return now >= turns ? "ok" : "under";
}
