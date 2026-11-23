/**
 * Counter plate (spec 2026-11-17 offers & loyalty, "Counter plate"): a
 * plate at the bar with a QR code and NFC chip holding `/t/<code>`. The
 * customer taps it with their own phone (signed in to their Scan Pass); the
 * staff member types the brewery's 4-digit staff code on that phone, and only
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

/** Staff-code tries at one plate by one customer in the last PLATE_LOCK_MINUTES. */
export type AttemptStore = {
  record(): Promise<string>;
  recent(): Promise<number>;
  clear(id: string): Promise<void>;
};

/**
 * Every try is written down BEFORE the code is checked and counted after, so
 * guesses sent all at once each see the others and can't slip past the limit
 * (final review, Important 1). A right code (within the limit) erases its try.
 */
export async function staffCodeGate<M>(
  store: AttemptStore,
  match: () => M | null,
): Promise<{ kind: "ok"; match: M } | { kind: "wrong-code"; triesLeft: number } | { kind: "locked" }> {
  const id = await store.record();
  const tries = await store.recent();
  if (tries > PLATE_MAX_MISSES) return { kind: "locked" };
  const found = match();
  if (found !== null) {
    await store.clear(id);
    return { kind: "ok", match: found };
  }
  const left = triesLeft(tries);
  return left === 0 ? { kind: "locked" } : { kind: "wrong-code", triesLeft: left };
}

export type SignUpChoice = "join-trail" | "free-card";
export type SignedOutButtons = { primary: SignUpChoice; secondary: SignUpChoice[] };

/**
 * The plate's sign-up buttons for someone not signed in (universal card): a
 * Beer Trail stop leads with the pass; any other member with the free card.
 * With no pass on sale, only the free card.
 */
export function signedOutButtons(i: { trailStop: boolean; canJoinTrail: boolean }): SignedOutButtons {
  if (!i.canJoinTrail) return { primary: "free-card", secondary: [] };
  return i.trailStop ? { primary: "join-trail", secondary: ["free-card"] } : { primary: "free-card", secondary: ["join-trail"] };
}
