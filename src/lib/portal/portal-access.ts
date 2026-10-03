import type { SupabaseClient } from "@supabase/supabase-js";
import { isPortalRole, type PortalRole } from "@/lib/portal/portal-destination";

/**
 * The pure/injectable core of getting into /portal: accepting pending
 * invites, listing the signed-in user's memberships, and picking which one
 * to open. The Supabase client is passed in (the service-role client in
 * production, a fake in tests), the same split as member-email.server.ts.
 * Every query here is keyed on the signed-in user's own id or email, which
 * the caller takes from the verified Supabase session -- never from input.
 */

export type PortalMembership = {
  memberId: string;
  role: PortalRole;
  businessName: string;
  typeConfirmedAt: string | null;
  setupCompletedAt: string | null;
};

type InviteRow = {
  id: string;
  member_id: string;
  role: string;
  email: string;
  expires_at: string;
};

/** Escapes LIKE wildcards so the address is matched literally (case-insensitively). */
function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Spec, "The People section": when someone signs in with an invited
 * address, the invite is accepted and a member_users row is created with
 * the invited role. Also works for people who already have an account.
 *
 * Only invites that are not accepted, not cancelled and not expired, whose
 * address equals the user's (compared lower-cased, the way sign-in compares
 * it) are accepted. The database filter narrows the rows; the exact address
 * comparison is repeated here so a LIKE quirk can never accept an invite
 * sent to someone else.
 *
 * If the user is already linked to that member (unique violation 23505),
 * their existing row and role are kept and the invite is still marked
 * accepted -- it has done its job. Any other insert error leaves the invite
 * pending so the next visit tries again.
 */
export async function acceptPendingInvites(
  client: SupabaseClient,
  user: { id: string; email: string | null | undefined },
  now: Date = new Date(),
): Promise<{ accepted: Array<{ memberId: string; role: string }> }> {
  const email = user.email?.trim().toLowerCase();
  if (!email) return { accepted: [] };

  const nowIso = now.toISOString();
  const { data, error } = await client
    .from("member_invites")
    .select("id, member_id, role, email, expires_at")
    .ilike("email", likeLiteral(email))
    .is("accepted_at", null)
    .is("cancelled_at", null)
    .gt("expires_at", nowIso);
  if (error || !data) return { accepted: [] };

  const accepted: Array<{ memberId: string; role: string }> = [];
  for (const invite of data as InviteRow[]) {
    if (invite.email.trim().toLowerCase() !== email) continue;
    if (new Date(invite.expires_at).getTime() <= now.getTime()) continue;
    if (invite.role !== "editor" && invite.role !== "media_events") continue;

    const { error: insertError } = await client
      .from("member_users")
      .insert({ member_id: invite.member_id, user_id: user.id, role: invite.role });
    if (insertError && insertError.code !== "23505") continue;

    const { error: updateError } = await client
      .from("member_invites")
      .update({ accepted_at: nowIso, accepted_user_id: user.id })
      .eq("id", invite.id)
      .is("accepted_at", null);
    if (updateError) continue;

    accepted.push({ memberId: invite.member_id, role: invite.role });
  }
  return { accepted };
}

type MembershipRow = {
  member_id: string;
  role: string;
  members: {
    business_name: string | null;
    type_confirmed_at: string | null;
    setup_completed_at: string | null;
  } | null;
};

/** The user's member_users rows with each member's name and setup state, oldest link first. */
export async function listPortalMemberships(client: SupabaseClient, userId: string): Promise<PortalMembership[]> {
  const { data, error } = await client
    .from("member_users")
    .select("member_id, role, created_at, members(business_name, type_confirmed_at, setup_completed_at)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];

  const memberships: PortalMembership[] = [];
  for (const row of data as unknown as MembershipRow[]) {
    if (!row.members || !isPortalRole(row.role)) continue;
    memberships.push({
      memberId: row.member_id,
      role: row.role,
      businessName: row.members.business_name?.trim() || "Unnamed business",
      typeConfirmedAt: row.members.type_confirmed_at,
      setupCompletedAt: row.members.setup_completed_at,
    });
  }
  return memberships;
}

export type MembershipPick =
  | { kind: "none" }
  | { kind: "choose"; memberships: PortalMembership[] }
  | { kind: "one"; membership: PortalMembership };

/**
 * Decision 9: someone linked to more than one member gets a "Choose a
 * business" screen. Their choice is remembered in a cookie, but the cookie
 * only ever names a member id -- it is honored solely when that id is one
 * of the memberships just read from member_users for this user, so it can
 * never grant access by itself (a removed link, or a hand-edited cookie,
 * simply brings the chooser back). `forceChoose` is the "Switch business"
 * link.
 */
export function pickMembership(
  memberships: PortalMembership[],
  chosenMemberId: string | null | undefined,
  forceChoose = false,
): MembershipPick {
  if (memberships.length === 0) return { kind: "none" };
  if (memberships.length === 1) return { kind: "one", membership: memberships[0] };
  if (!forceChoose && chosenMemberId) {
    const chosen = memberships.find((m) => m.memberId === chosenMemberId);
    if (chosen) return { kind: "one", membership: chosen };
  }
  return { kind: "choose", memberships };
}
