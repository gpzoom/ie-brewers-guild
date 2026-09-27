import type { SupabaseClient } from "@supabase/supabase-js";

export type RoleRoutingResult =
  | { role: "guild_admin"; redirectTo: "/guild" }
  | { role: "member_editor"; memberId: string; redirectTo: "/portal" }
  | { role: "none"; redirectTo: "/signin" };

/**
 * The one place "where does this signed-in user land" is decided (spec:
 * "The magic link routes by role, not by URL"). /auth/callback and the
 * /admin route's own auth guard both call this rather than reimplementing
 * the check a second way. Members land in the Member Portal; the old
 * /admin editor is no longer a landing page (2026-09-27).
 *
 * Precedence: if a user has both a profiles.is_guild_admin row and a
 * member_users row, Guild-admin routing wins (this plan's Decision 2 --
 * the spec doesn't state this explicitly).
 */
export async function resolveUserRoleAndTarget(
  supabase: SupabaseClient,
  userId: string,
): Promise<RoleRoutingResult> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_guild_admin")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.is_guild_admin) {
    return { role: "guild_admin", redirectTo: "/guild" };
  }

  const { data: memberUser } = await supabase
    .from("member_users")
    .select("member_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memberUser?.member_id) {
    return { role: "member_editor", memberId: memberUser.member_id, redirectTo: "/portal" };
  }

  return { role: "none", redirectTo: "/signin" };
}

/**
 * Where /auth/callback sends someone once their session exists. `next` must
 * already have passed safeNextPath. A valid `next` wins for members and for
 * people with no member link yet (/portal is where pending invites are
 * accepted); a Guild admin follows it only while editing as a member,
 * otherwise they go to /guild as always. No `next` is treated as the Member
 * Portal (/portal), so a plain sign-in behaves exactly like the footer's
 * Member Portal link.
 */
export function resolveCallbackRedirect(
  routing: RoleRoutingResult,
  next: string | undefined,
  isImpersonating: boolean,
): string {
  if (routing.role === "guild_admin" && (!next || !isImpersonating)) return routing.redirectTo;
  return next ?? "/portal";
}
