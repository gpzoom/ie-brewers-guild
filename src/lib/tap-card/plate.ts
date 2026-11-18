/**
 * Counter plate (spec 2026-11-17 offers & loyalty, "Counter plate"): a
 * plate at the bar with a QR code and NFC chip holding `/t/<code>`. The
 * customer taps it with their own phone (signed in to their Tap Card); the
 * bartender types the brewery's 4-digit staff code on that phone, and only
 * then is anything recorded. After 5 wrong codes the plate locks for that
 * customer at that brewery for 15 minutes.
 */
export const PLATE_MAX_MISSES = 5;
export const PLATE_LOCK_MINUTES = 15;

export function validateStaffCode(raw: string): { ok: true; code: string } | { ok: false; message: string } {
  const code = String(raw ?? "").trim();
  return /^[0-9]{4}$/.test(code) ? { ok: true, code } : { ok: false, message: "Use 4 digits." };
}

export function staffCodeMatches(entered: string, stored: string | null): boolean {
  return stored !== null && String(entered ?? "").trim() === stored;
}

export function plateUrl(siteUrl: string, code: string): string {
  return `${siteUrl}/t/${code}`;
}

export function triesLeft(missesInWindow: number): number {
  return Math.max(0, PLATE_MAX_MISSES - missesInWindow);
}

/** Where an emailed sign-in link may send a holder afterward: a plate page or their card page, nothing else. */
export function safeHolderNext(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw === "/card") return raw;
  return /^\/t\/[0-9A-HJKMNP-TV-Z]{8}$/.test(raw) ? raw : null;
}
