import { hashUploadToken } from "@/lib/media/upload-tokens";

/**
 * The 6-digit code in the Scan Pass sign-in email (beside the link). It works
 * anywhere the link can't -- e.g. inside a card saved to an iPhone's Home
 * Screen, which keeps its own sign-in apart from the browser. Same 60-minute,
 * one-use life as the link; 5 wrong tries end it.
 */
export const SIGNIN_CODE_MAX_TRIES = 5;

export function generateSignInCode(): string {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(n[0] % 1_000_000).padStart(6, "0");
}

export function normalizeSignInCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.replace(/[\s-]/g, "");
  return /^[0-9]{6}$/.test(code) ? code : null;
}

/** Hashed with its sign-in row's id, so the same 6 digits never look alike twice. */
export function signInCodeHash(rowId: string, code: string): Promise<string> {
  return hashUploadToken(`${rowId}:${code}`);
}

export type SignInCodeStore = {
  /** The holder's newest unused, unexpired sign-in row that has a code. */
  latest(): Promise<{ id: string; codeHash: string; tries: number } | null>;
  /** Counts a try, only if no other try was counted since `seen`. */
  addTry(id: string, seen: number): Promise<boolean>;
  /** Marks the row used; false if it already was. */
  claim(id: string): Promise<boolean>;
  /** Ends the row after too many wrong tries. */
  burn(id: string): Promise<void>;
};

export type SignInCodeResult = { kind: "ok" } | { kind: "wrong"; triesLeft: number } | { kind: "too-many" } | { kind: "expired" } | { kind: "busy" };

/**
 * Every try is counted BEFORE the code is compared, and only one try per
 * count gets compared, so guesses sent all at once can't exceed the limit.
 */
export async function verifySignInCode(store: SignInCodeStore, code: string): Promise<SignInCodeResult> {
  const row = await store.latest();
  if (!row) return { kind: "expired" };
  if (row.tries >= SIGNIN_CODE_MAX_TRIES) {
    await store.burn(row.id);
    return { kind: "too-many" };
  }
  if (!(await store.addTry(row.id, row.tries))) return { kind: "busy" };
  if ((await signInCodeHash(row.id, code)) === row.codeHash) {
    return (await store.claim(row.id)) ? { kind: "ok" } : { kind: "expired" };
  }
  const left = SIGNIN_CODE_MAX_TRIES - (row.tries + 1);
  if (left <= 0) {
    await store.burn(row.id);
    return { kind: "too-many" };
  }
  return { kind: "wrong", triesLeft: left };
}
