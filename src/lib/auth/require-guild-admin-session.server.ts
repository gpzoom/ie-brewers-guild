import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { resolveUserRoleAndTarget } from "@/lib/auth/role-routing";

/**
 * Runs once, in /guild's own beforeLoad, inherited by every child route.
 * Reuses resolveUserRoleAndTarget (Member Admin phase, Task 3) rather than
 * re-implementing the is_guild_admin check a second way -- consistent with
 * that phase's own Decision 2 (guild-admin routing takes precedence over
 * member-editor routing whenever both apply).
 */
export const requireGuildAdminSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ userId: string }> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) {
      throw redirect({ href: "/signin" });
    }

    const routing = await resolveUserRoleAndTarget(supabase, user.id);
    if (routing.role !== "guild_admin") {
      // A member editor (or a signed-in user with neither role) has no
      // business under /guild at all -- send them to wherever
      // resolveUserRoleAndTarget says they actually belong.
      throw redirect({ href: routing.redirectTo });
    }

    return { userId: user.id };
  },
);
