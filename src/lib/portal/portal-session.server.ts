import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import {
  getSupabaseServerClientForRequest,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import {
  readImpersonationState,
  touchImpersonationActivity,
} from "@/lib/guild/impersonation.server";
import {
  acceptPendingInvites,
  listPortalMemberships,
  pickMembership,
} from "@/lib/portal/portal-access";
import {
  PORTAL_MEMBER_COOKIE,
  PORTAL_MEMBER_COOKIE_MAX_AGE,
} from "@/lib/portal/portal-member-cookie";
import {
  chooserEntries,
  locationSwitcherFor,
  type ChooserEntry,
  type LocationSwitcherData,
} from "@/lib/portal/location-groups";
import {
  resolvePortalDestination,
  type PortalDestination,
  type PortalRole,
} from "@/lib/portal/portal-destination";

export type PortalState =
  | { kind: "no-member"; email: string | null }
  | { kind: "choose"; entries: ChooserEntry[] }
  | {
      kind: "ready";
      memberId: string;
      memberName: string;
      role: PortalRole;
      isImpersonating: boolean;
      destination: PortalDestination;
      /** The location list for the chosen business's switcher; null when it has no sibling locations or while impersonating. */
      switcher: LocationSwitcherData | null;
      /** True when the user can open more than one business (the "Switch business" link). */
      canSwitchBusiness: boolean;
    };

/**
 * /portal's resolver. Redirects when there's no session (back to sign-in,
 * returning here) and for a Guild admin who isn't editing as anyone and has
 * no member link of their own (to /guild). A Guild admin mid-"Edit as them"
 * gets the impersonated member with owner rights, the same semantics as
 * requireMemberSession -- except that a cookie started by a different
 * signed-in user is simply ignored here rather than bouncing to the roster,
 * since /portal is also where members land.
 *
 * Otherwise: accept the user's pending invites, read their memberships and
 * pick one (none / choose / one), then apply the wizard-or-portal rule.
 */
export const getPortalState = createServerFn({ method: "GET" })
  .inputValidator((data: { forceChoose?: boolean }) => ({
    forceChoose: data?.forceChoose === true,
  }))
  .handler(async ({ data }): Promise<PortalState> => {
    const { state } = await resolvePortalState({
      forceChoose: data.forceChoose,
      acceptInvites: true,
    });
    return state;
  });

/**
 * getPortalState's body, shared with requirePortalMember. Also returns the
 * signed-in user's id (never sent to the page by getPortalState).
 */
const resolvePortalState = createServerOnlyFn(
  async (options: {
    forceChoose: boolean;
    acceptInvites: boolean;
  }): Promise<{ state: PortalState; userId: string }> => {
    const data = { forceChoose: options.forceChoose };
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      throw redirect({ href: "/signin?next=%2Fportal" });
    }

    const service = await getSupabaseServiceRoleClient();

    // The impersonation cookie alone isn't enough: it also has to come from
    // someone who is STILL a Guild admin. A Guild admin editing as a member
    // gets owner rights here, and the People actions use the service-role
    // client, so an admin demoted mid-session must lose those rights on
    // their next request, not when the cookie goes idle.
    const impersonation = await readImpersonationState();
    let actorIsGuildAdmin = false;
    if (impersonation && impersonation.actorUserId === user.id) {
      const { data: actorProfile } = await supabase
        .from("profiles")
        .select("is_guild_admin")
        .eq("id", user.id)
        .maybeSingle();
      actorIsGuildAdmin = actorProfile?.is_guild_admin === true;
    }
    if (impersonation && impersonation.actorUserId === user.id && actorIsGuildAdmin) {
      await touchImpersonationActivity(impersonation);
      const { data: member } = await service
        .from("members")
        .select("business_name, type_confirmed_at, setup_completed_at")
        .eq("id", impersonation.memberId)
        .maybeSingle();
      if (!member) {
        throw redirect({ href: "/guild/roster" });
      }
      const role: PortalRole = "owner";
      return {
        userId: user.id,
        state: {
          kind: "ready",
          memberId: impersonation.memberId,
          memberName: (member.business_name as string | null)?.trim() || "Unnamed business",
          role,
          isImpersonating: true,
          destination: resolvePortalDestination({
            typeConfirmedAt: member.type_confirmed_at as string | null,
            setupCompletedAt: member.setup_completed_at as string | null,
            role,
          }),
          switcher: null,
          canSwitchBusiness: false,
        },
      };
    }

    if (options.acceptInvites) {
      await acceptPendingInvites(service, { id: user.id, email: user.email });
    }
    const memberships = await listPortalMemberships(service, user.id);

    if (memberships.length === 0) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_guild_admin")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.is_guild_admin) {
        throw redirect({ href: "/guild" });
      }
    }

    const pick = pickMembership(memberships, getCookie(PORTAL_MEMBER_COOKIE), data.forceChoose);

    if (pick.kind === "none") {
      return { userId: user.id, state: { kind: "no-member", email: user.email ?? null } };
    }
    if (pick.kind === "choose") {
      return {
        userId: user.id,
        state: {
          kind: "choose",
          entries: chooserEntries(pick.memberships, getCookie(PORTAL_MEMBER_COOKIE)),
        },
      };
    }

    const chosen = pick.membership;
    return {
      userId: user.id,
      state: {
        kind: "ready",
        memberId: chosen.memberId,
        memberName: chosen.businessName,
        role: chosen.role,
        isImpersonating: false,
        destination: resolvePortalDestination({
          typeConfirmedAt: chosen.typeConfirmedAt,
          setupCompletedAt: chosen.setupCompletedAt,
          role: chosen.role,
        }),
        switcher: locationSwitcherFor(memberships, chosen.memberId),
        canSwitchBusiness: chooserEntries(memberships).length > 1,
      },
    };
  },
);

export type PortalMember = Extract<PortalState, { kind: "ready" }> & { userId: string };

/**
 * The server-side member check for everything under /portal/setup (and the
 * phase 5 portal sections): who is signed in, which business they're
 * working on, and their role -- worked out again from the session on
 * EVERY call, exactly as /portal does it (impersonation cookie from the
 * same Guild admin, else the user's own member_users rows plus the
 * "Choose a business" cookie, which only ever narrows to one of those
 * rows). The member id is never taken from the client.
 *
 * Throws a redirect: to sign-in (returning to /portal) when signed out, and
 * to /portal when there's no single business to work on (none linked, or
 * a choice still to make) -- /portal shows the right screen for those.
 * Doesn't accept invites (only /portal's own front door does that).
 */
export const requirePortalMember = createServerOnlyFn(async (): Promise<PortalMember> => {
  const { state, userId } = await resolvePortalState({ forceChoose: false, acceptInvites: false });
  if (state.kind !== "ready") {
    throw redirect({ href: "/portal" });
  }
  return { ...state, userId };
});

/**
 * "Choose a business": remembers the pick. Refuses a member the signed-in
 * user isn't linked to, so the cookie is only ever set to a real link (and
 * getPortalState re-checks it on every request anyway).
 */
export const choosePortalMember = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => {
    if (
      typeof data?.memberId !== "string" ||
      data.memberId.length === 0 ||
      data.memberId.length > 64
    ) {
      throw new Error("Choose a business.");
    }
    return { memberId: data.memberId };
  })
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) throw new Error("Not signed in.");

    const service = await getSupabaseServiceRoleClient();
    const memberships = await listPortalMemberships(service, user.id);
    if (!memberships.some((m) => m.memberId === data.memberId)) {
      throw new Error("That business isn't linked to this sign-in.");
    }

    setCookie(PORTAL_MEMBER_COOKIE, data.memberId, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: PORTAL_MEMBER_COOKIE_MAX_AGE,
    });
    return { ok: true as const };
  });
