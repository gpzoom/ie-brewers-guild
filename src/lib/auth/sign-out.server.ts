import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { IMPERSONATION_COOKIE_NAME } from "@/lib/guild/impersonation.server";

/**
 * Ends impersonation and the real Supabase Auth session together, in one
 * server action, so impersonation can never outlive the sign-out that was
 * supposed to end it (spec: session "ends on sign-out and on a short idle
 * timeout").
 */
export const signOutEverything = createServerFn({ method: "POST" }).handler(async () => {
  setCookie(IMPERSONATION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  const supabase = await getSupabaseServerClientForRequest();
  await supabase.auth.signOut();

  return { ok: true as const };
});
