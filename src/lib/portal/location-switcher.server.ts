import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { readImpersonationState } from "@/lib/guild/impersonation.server";
import { listPortalMemberships } from "@/lib/portal/portal-access";
import { adminMemberIdFor, locationSwitcherFor, type LocationSwitcherData } from "@/lib/portal/location-groups";
import { PORTAL_MEMBER_COOKIE } from "@/lib/portal/portal-member-cookie";

/**
 * /admin's location switcher (artboard BZ2). Same member rule as
 * requireMemberSession; none while a Guild admin is editing as a member.
 */
export const getAdminLocationSwitcher = createServerFn({ method: "GET" }).handler(
  async (): Promise<LocationSwitcherData | null> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return null;
    if (await readImpersonationState()) return null;

    const service = await getSupabaseServiceRoleClient();
    const memberships = await listPortalMemberships(service, user.id);
    const memberId = adminMemberIdFor(memberships, getCookie(PORTAL_MEMBER_COOKIE));
    return memberId ? locationSwitcherFor(memberships, memberId) : null;
  },
);
