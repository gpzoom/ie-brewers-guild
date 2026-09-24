import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getCookies } from "@tanstack/react-start/server";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { resolveUserRoleAndTarget } from "@/lib/auth/role-routing";

export type GuildAdminStatus = { isGuildAdmin: boolean };

/**
 * Whether any cookie looks like a Supabase auth-session cookie
 * ("sb-<project-ref>-auth-token", possibly chunked as "...-auth-token.0"/
 * ".1" -- see @supabase/ssr's own clearAuthCookiesAtScopes.js for the
 * naming convention). A pure, exported check so the common case -- a
 * visitor with no Supabase cookie at all -- can skip the real session
 * check (a JWT-validating call to Supabase Auth, plus a role lookup)
 * entirely. This runs on every page load via __root.tsx's loader, so
 * keeping it free for the vast majority of anonymous visitors matters.
 */
export function hasSupabaseAuthCookie(cookieNames: string[]): boolean {
  return cookieNames.some((name) => name.startsWith("sb-") && name.includes("auth-token"));
}

/**
 * Injectable Supabase client getter, same pattern as resolve-recipient.server.ts,
 * so this is unit-testable without a real request/database.
 */
export async function checkGuildAdminStatus(
  cookieNames: string[],
  getClient: () => Promise<SupabaseClient>,
): Promise<GuildAdminStatus> {
  if (!hasSupabaseAuthCookie(cookieNames)) return { isGuildAdmin: false };

  const supabase = await getClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { isGuildAdmin: false };

  const routing = await resolveUserRoleAndTarget(supabase, userData.user.id);
  return { isGuildAdmin: routing.role === "guild_admin" };
}

/**
 * Powers the persistent Guild-admin nav bar rendered under the public
 * header on every page (__root.tsx) -- NOT itself a security boundary:
 * requireGuildAdminSession (require-guild-admin-session.server.ts) still
 * independently gates every real /guild route. A false positive here
 * would only show a dead-end link, never grant real access, so this
 * degrades to "hidden" on any failure rather than surfacing an error to
 * a page that has nothing to do with Guild admin.
 */
export const getGuildAdminStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<GuildAdminStatus> => {
    try {
      return await checkGuildAdminStatus(Object.keys(getCookies()), getSupabaseServerClientForRequest);
    } catch (err) {
      console.error("getGuildAdminStatus: failed, defaulting to hidden", err);
      return { isGuildAdmin: false };
    }
  },
);
