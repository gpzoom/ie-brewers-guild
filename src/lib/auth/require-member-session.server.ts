import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { resolveUserRoleAndTarget } from "@/lib/auth/role-routing";

/**
 * Runs once, in /admin's own beforeLoad, and is inherited by every child
 * route under it. Redirects to /signin if there's no session, to /guild if
 * the signed-in user is a Guild admin rather than a member editor (reusing
 * resolveUserRoleAndTarget rather than re-checking is_guild_admin a second
 * way), and to /signin?notice=no-account for the "neither role" edge case
 * (this plan's Decision 1).
 */
export const requireMemberSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ memberId: string; userId: string }> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) {
      throw redirect({ href: "/signin" });
    }

    const routing = await resolveUserRoleAndTarget(supabase, user.id);

    if (routing.role === "guild_admin") {
      throw redirect({ href: "/guild" });
    }
    if (routing.role === "none") {
      throw redirect({ href: "/signin?notice=no-account" });
    }

    return { memberId: routing.memberId, userId: user.id };
  },
);
