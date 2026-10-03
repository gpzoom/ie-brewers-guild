import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { resolveUserRoleAndTarget } from "@/lib/auth/role-routing";
import { isSuperAdminSession } from "@/lib/auth/super-admin";

/**
 * Runs once, in /guild's own beforeLoad, inherited by every child route.
 * Reuses resolveUserRoleAndTarget (Member Admin phase, Task 3) rather than
 * re-implementing the is_guild_admin check a second way -- consistent with
 * that phase's own Decision 2 (guild-admin routing takes precedence over
 * member-editor routing whenever both apply).
 *
 * Also says whether this is the super admin (docs/member-profiles.md,
 * "Super admin"), for the top bar label and the menus. That only steers
 * what's SHOWN; every super-admin-only action is checked again on the
 * server and in the database.
 */
export const requireGuildAdminSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ userId: string; isSuperAdmin: boolean }> => {
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

    return { userId: user.id, isSuperAdmin: await isSuperAdminSession(supabase) };
  },
);
