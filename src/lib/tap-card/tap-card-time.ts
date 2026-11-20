import { TZDate } from "@date-fns/tz";

/**
 * The Scan Pass's day and year are Pacific (owner, 2026-11-17): one visit per
 * brewery per Pacific day, one offer per brewery per calendar year. A visit
 * at 11:30 pm on Dec 31 belongs to the old year even though it's already
 * Jan 1 in UTC.
 */
export const TAP_CARD_TZ = "America/Los_Angeles";

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" in Pacific time. */
export function tapCardDay(at: Date): string {
  const local = new TZDate(at.getTime(), TAP_CARD_TZ);
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
}

export function tapCardYear(at: Date): number {
  return new TZDate(at.getTime(), TAP_CARD_TZ).getFullYear();
}
