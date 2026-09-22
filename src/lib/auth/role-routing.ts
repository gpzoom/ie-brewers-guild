import type { SupabaseClient } from "@supabase/supabase-js";

export type RoleRoutingResult =
  | { role: "guild_admin"; redirectTo: "/guild" }
  | { role: "member_editor"; memberId: string; redirectTo: "/admin" }
  | { role: "none"; redirectTo: "/signin" };

/**
 * The one place "where does this signed-in user land" is decided (spec:
 * "The magic link routes by role, not by URL"). /auth/callback and the
 * /admin route's own auth guard both call this rather than reimplementing
 * the check a second way.
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
    return { role: "member_editor", memberId: memberUser.member_id, redirectTo: "/admin" };
  }

  return { role: "none", redirectTo: "/signin" };
}
