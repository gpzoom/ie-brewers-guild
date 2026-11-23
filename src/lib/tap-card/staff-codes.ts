/**
 * Named staff codes (spec 2026-11-23 staff QR tracking): each staff member can
 * have a personal 4-digit code, so a check-in can be traced to a person. The
 * brewery's shared code keeps working (and can be turned off).
 */

/** requireTapCardOwner's refusal; the screens hide the staff boxes on it. */
export const STAFF_CODES_OWNER_ONLY = "Only the owner or a co-owner can manage staff codes.";

const NAME_ERROR = "Type a name of 1 to 40 characters.";

/** A staff name: 1 to 40 characters, extra spaces squeezed; `key` ignores case, for the unique-per-member check. */
export function cleanStaffName(raw: string): { ok: true; name: string; key: string } | { ok: false; message: string } {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 40) return { ok: false, message: NAME_ERROR };
  return { ok: true, name, key: name.toLowerCase() };
}

/** A whole number from 0 to n-1 from crypto randomness, with no modulo bias (rejects the uneven tail). */
function cryptoIndex(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

/**
 * A random 4-digit code not in `taken`, or null when all 10,000 are used.
 * Default randomness is cryptographic and unbiased; `random` (0 up to, not
 * including, 1) is for tests.
 */
export function generatePin(taken: ReadonlySet<string>, random?: () => number): string | null {
  const free: string[] = [];
  for (let n = 0; n < 10000; n++) {
    const code = String(n).padStart(4, "0");
    if (!taken.has(code)) free.push(code);
  }
  if (free.length === 0) return null;
  const i = random ? Math.min(free.length - 1, Math.floor(random() * free.length)) : cryptoIndex(free.length);
  return free[i];
}

export type PersonalPin = { codeId: string; staffId: string; code: string; active: boolean };
export type PinMatch = { source: "staff"; staffId: string; codeId: string } | { source: "staff-code" } | null;

/** Which code was typed: the shared code (when on) wins, then an active personal code. */
export function matchPin(entered: string, i: { shared: string | null; sharedOff: boolean; personal: PersonalPin[] }): PinMatch {
  const typed = String(entered ?? "").trim();
  if (i.shared !== null && !i.sharedOff && typed === i.shared) return { source: "staff-code" };
  const hit = i.personal.find((p) => p.active && p.code === typed);
  return hit ? { source: "staff", staffId: hit.staffId, codeId: hit.codeId } : null;
}

/** The counter plate is on with a shared code (even switched off) or at least one active personal code. */
export function plateIsOn(i: { shared: string | null; personalActive: number }): boolean {
  return i.shared !== null || i.personalActive > 0;
}

/** A shared code may not equal a code issued to a staff member. */
export function sharedPinSaveError(code: string, issued: ReadonlySet<string>): string | null {
  return issued.has(code) ? "That code belongs to a staff member. Choose another." : null;
}
