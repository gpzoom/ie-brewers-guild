import { createServerFn } from "@tanstack/react-start";
import { createServerOnlyFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import {
  isImpersonationExpired,
  signImpersonationState,
  verifyImpersonationCookie,
  type ImpersonationState,
} from "@/lib/guild/impersonation-token";

export const IMPERSONATION_COOKIE_NAME = "guild_impersonation";

/**
 * Duplicated locally rather than exported from src/lib/supabase/server.ts
 * (this plan's Decision 10) -- that file's own getWorkerEnv is private and
 * two lines long; this is the same pattern, narrowly typed to the one new
 * secret this feature needs, so Phase 3/4's file doesn't grow a new public
 * export for a one-off need in a later phase.
 */
const getWorkerEnv = createServerOnlyFn(async (): Promise<{ IMPERSONATION_COOKIE_SECRET?: string }> => {
  const { env } = await import("cloudflare:workers");
  return env as { IMPERSONATION_COOKIE_SECRET?: string };
});

async function getCookieSecret(): Promise<string> {
  const env = await getWorkerEnv();
  if (!env.IMPERSONATION_COOKIE_SECRET) {
    throw new Error("Missing IMPERSONATION_COOKIE_SECRET in the Worker environment.");
  }
  return env.IMPERSONATION_COOKIE_SECRET;
}

async function setImpersonationCookie(state: ImpersonationState): Promise<void> {
  const secret = await getCookieSecret();
  const signed = await signImpersonationState(state, secret);
  setCookie(IMPERSONATION_COOKIE_NAME, signed, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
}

/**
 * Starts an impersonation session. Deliberately does NOT throw redirect()
 * -- this is called directly from a client onClick handler (the roster's
 * "Edit as them" button, Task 18), not from a route's beforeLoad/loader,
 * and TanStack Router's automatic redirect-following only applies to
 * redirects thrown from those two lifecycle points. The caller navigates
 * itself after this resolves.
 */
export const startImpersonation = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error("Not signed in.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_guild_admin")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile?.is_guild_admin) {
      throw new Error("Only a Guild admin can start an impersonation session.");
    }

    const now = Date.now();
    await setImpersonationCookie({
      actorUserId: userData.user.id,
      memberId: data.memberId,
      startedAt: now,
      lastActivityAt: now,
    });

    return { ok: true as const };
  });

/** Ends the session (spec: "Stopping returns to the roster") -- the caller navigates there. */
export const stopImpersonation = createServerFn({ method: "POST" }).handler(async () => {
  clearImpersonationCookie();
  return { ok: true as const };
});

/**
 * Expires the impersonation cookie. Shared by stopImpersonation and by
 * deleteMember (deleting the member currently being impersonated).
 */
export const clearImpersonationCookie = createServerOnlyFn((): void => {
  setCookie(IMPERSONATION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
});

/**
 * Reads and verifies the cookie, treating a missing, forged, or expired
 * cookie identically -- null, meaning "no active impersonation." Every
 * caller (the /admin auth guard, the audit-log wrapper, the public
 * profile's preview check) goes through this single function rather than
 * reading the raw cookie itself, so the verification and expiry rules only
 * live in one place.
 */
export const readImpersonationState = createServerOnlyFn(async (): Promise<ImpersonationState | null> => {
  const raw = getCookie(IMPERSONATION_COOKIE_NAME);
  if (!raw) return null;
  const secret = await getCookieSecret();
  const state = await verifyImpersonationCookie(raw, secret);
  if (!state) return null;
  if (isImpersonationExpired(state, Date.now())) return null;
  return state;
});

/**
 * Refreshes lastActivityAt and re-sets the cookie. Called from both the
 * /admin auth guard on every navigation (Task 19) and the audit-log
 * wrapper on every mutation (below) -- either kind of activity re-arms the
 * 30-minute idle timeout (this plan's Decision 4).
 */
export const touchImpersonationActivity = createServerOnlyFn(async (state: ImpersonationState): Promise<void> => {
  await setImpersonationCookie({ ...state, lastActivityAt: Date.now() });
});

/** Used by AdminShell's impersonation banner (Task 20) to name who's being edited. */
export const getMemberDisplayName = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: member } = await supabase
      .from("members")
      .select("business_name")
      .eq("id", data.memberId)
      .maybeSingle();
    return (member?.business_name as string | undefined) ?? null;
  });
