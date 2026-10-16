import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { resolveUserRoleAndTarget } from "@/lib/auth/role-routing";
import { getCookie } from "@tanstack/react-start/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { listPortalMemberships } from "@/lib/portal/portal-access";
import { adminMemberIdFor } from "@/lib/portal/location-groups";
import { PORTAL_MEMBER_COOKIE } from "@/lib/portal/portal-member-cookie";
import { readImpersonationState, touchImpersonationActivity } from "@/lib/guild/impersonation.server";

export type MemberSession = {
  memberId: string;
  userId: string;
  isImpersonating: boolean;
  actorUserId: string;
  /** The real signed-in person is the super admin (only they can change a member's sign-in email). */
  isSuperAdmin: boolean;
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
 *
 * Otherwise memberId is the location chosen in the portal (the portal_member
 * cookie, honored only when it names one of the user's own links).
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
      // Guild admin access can be removed (the super admin's Guild admins
      // screen); it ends on the next request, "Edit as them" included.
      const { data: actorProfile } = await supabase
        .from("profiles")
        .select("is_guild_admin, is_super_admin")
        .eq("id", user.id)
        .maybeSingle();
      if (!actorProfile?.is_guild_admin) {
        throw redirect({ href: "/signin" });
      }
      await touchImpersonationActivity(impersonation);
      return {
        memberId: impersonation.memberId,
        userId: user.id,
        isImpersonating: true,
        actorUserId: impersonation.actorUserId,
        isSuperAdmin: actorProfile.is_super_admin === true,
      };
    }

    const routing = await resolveUserRoleAndTarget(supabase, user.id);

    if (routing.role === "guild_admin") {
      throw redirect({ href: "/guild" });
    }
    if (routing.role === "none") {
      throw redirect({ href: "/signin?notice=no-account" });
    }

    // /admin follows the location chosen in the portal (spec 2026-10-15,
    // "Location switcher"): the portal_member cookie, honored only when it
    // names one of this user's own links -- else the oldest link, as before.
    const service = await getSupabaseServiceRoleClient();
    const memberships = await listPortalMemberships(service, user.id);
    const memberId = adminMemberIdFor(memberships, getCookie(PORTAL_MEMBER_COOKIE)) ?? routing.memberId;

    return {
      memberId,
      userId: user.id,
      isImpersonating: false,
      actorUserId: user.id,
      isSuperAdmin: false,
    };
  },
);
