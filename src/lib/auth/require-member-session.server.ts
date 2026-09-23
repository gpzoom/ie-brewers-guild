import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { resolveUserRoleAndTarget } from "@/lib/auth/role-routing";
import { readImpersonationState, touchImpersonationActivity } from "@/lib/guild/impersonation.server";

export type MemberSession = {
  memberId: string;
  userId: string;
  isImpersonating: boolean;
  actorUserId: string;
};

/**
 * Runs once, in /admin's own beforeLoad, inherited by every child route.
 * Redirects to /signin if there's no session, to /guild if the signed-in
 * user is a Guild admin rather than a member editor AND isn't currently
 * impersonating anyone, and to /signin?notice=no-account for the "neither
 * role" edge case (Member Admin phase's Decision 1).
 *
 * Guild Admin phase addition: a valid, non-expired impersonation cookie
 * overrides normal role routing entirely. The signed-in user is still,
 * underneath, the Guild admin's own Supabase Auth session -- auth.uid()
 * never changes during impersonation (this plan's Decision 5) -- so RLS's
 * is_guild_admin() policies are what actually grant the resulting writes;
 * this function's only job during impersonation is to report the
 * IMPERSONATED member's id as memberId, so every existing child route and
 * mutation file keeps working completely unmodified.
 */
export const requireMemberSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<MemberSession> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) {
      throw redirect({ href: "/signin" });
    }

    const impersonation = await readImpersonationState();
    if (impersonation) {
      if (impersonation.actorUserId !== user.id) {
        // The signed-in browser session doesn't match who the cookie says
        // started this impersonation (e.g. a different admin signed in on
        // the same device afterward). Never honor a mismatched cookie.
        throw redirect({ href: "/guild/roster" });
      }
      await touchImpersonationActivity(impersonation);
      return {
        memberId: impersonation.memberId,
        userId: user.id,
        isImpersonating: true,
        actorUserId: impersonation.actorUserId,
      };
    }

    const routing = await resolveUserRoleAndTarget(supabase, user.id);

    if (routing.role === "guild_admin") {
      throw redirect({ href: "/guild" });
    }
    if (routing.role === "none") {
      throw redirect({ href: "/signin?notice=no-account" });
    }

    return { memberId: routing.memberId, userId: user.id, isImpersonating: false, actorUserId: user.id };
  },
);
