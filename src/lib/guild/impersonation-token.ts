/**
 * The impersonation session-state mechanism (spec: "the session records
 * both the real admin and the member being edited"). Carried in a signed,
 * httpOnly cookie -- consistent with how this project's own magic-link
 * session already flows through cookies (@supabase/ssr's createServerClient
 * from the Member Admin phase) -- separate from the Supabase session
 * cookie itself, HMAC-signed so it can't be forged or hand-edited
 * client-side. Idle timeout is 30 minutes (this plan's Decision 4).
 */
export type ImpersonationState = {
  actorUserId: string;
  memberId: string;
  startedAt: number;
  lastActivityAt: number;
};

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export function isImpersonationExpired(state: ImpersonationState, now: number): boolean {
  return now - state.lastActivityAt > IDLE_TIMEOUT_MS;
}

/**
 * Every write made while impersonating is logged against the real actor
 * (spec, "Editing as a member") -- but only when the write actually targets
 * the member the cookie says is being impersonated. A mismatch (the cookie
 * says member A, but the mutation call targets member B) never logs
 * anything; audit-log.server.ts (Task 13) treats that the same as "not
 * impersonating" and lets RLS alone decide whether the write itself is even
 * allowed.
 */
export function shouldRecordAudit(state: ImpersonationState | null, targetMemberId: string): boolean {
  return state !== null && state.memberId === targetMemberId;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function signImpersonationState(state: ImpersonationState, secret: string): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(state)));
  const signature = await hmacSign(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifyImpersonationCookie(
  cookieValue: string,
  secret: string,
): Promise<ImpersonationState | null> {
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  const expectedSignature = await hmacSign(payload, secret);
  if (!timingSafeEqual(expectedSignature, signature)) return null;

  try {
    const decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as ImpersonationState;
    if (
      typeof decoded.actorUserId !== "string" ||
      typeof decoded.memberId !== "string" ||
      typeof decoded.startedAt !== "number" ||
      typeof decoded.lastActivityAt !== "number"
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}
