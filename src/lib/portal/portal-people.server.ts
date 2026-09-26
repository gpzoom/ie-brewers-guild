import { createServerFn } from "@tanstack/react-start";
import {
  getSupabaseServerClientForRequest,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { requirePortalMember, type PortalMember } from "@/lib/portal/portal-session.server";
import { supabasePeopleStore } from "@/lib/portal/people-store.server";
import {
  cancelInvite,
  invitePerson,
  removePerson,
  resendInvite,
  type InviteRole,
} from "@/lib/portal/people";
import { sendTransactionalEmail } from "@/lib/email/send";

/**
 * The People section's actions (docs/member-profiles.md, "The People
 * section" and "Enforcement": "People actions are owner-only, checked in
 * the Worker"). Every call resolves the member from the SESSION and checks
 * the caller is its owner -- or a Guild admin editing as them, who acts
 * with owner rights -- before the service-role client is touched. The
 * browser only ever sends an email, a role, or the id of an invite or
 * person, and each of those is looked up within this member only.
 */

async function requireOwner(): Promise<PortalMember> {
  const member = await requirePortalMember();
  if (member.role !== "owner") {
    throw new Error("Only the profile's owner can manage people.");
  }
  return member;
}

async function peopleStore() {
  return supabasePeopleStore(await getSupabaseServiceRoleClient());
}

/** The owner's own address for the invite email; null when a Guild admin is editing as them. */
async function inviterEmail(member: PortalMember): Promise<string | null> {
  if (member.isImpersonating) return null;
  const supabase = await getSupabaseServerClientForRequest();
  const { data } = await supabase.auth.getUser();
  return data?.user?.email ?? null;
}

/** Sends the invite email. A failed send never undoes the invite; the owner can Resend. */
async function emailInvite(
  member: PortalMember,
  invite: { email: string; role: InviteRole },
): Promise<boolean> {
  try {
    await sendTransactionalEmail({
      trigger: "editor_invited",
      memberId: member.memberId,
      memberName: member.memberName,
      email: invite.email,
      role: invite.role,
      inviterEmail: await inviterEmail(member),
    });
    return true;
  } catch (err) {
    console.error("People: couldn't send the invite email", err);
    return false;
  }
}

export const invitePortalPerson = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; role: InviteRole }) => ({
    email: data?.email,
    role: data?.role,
  }))
  .handler(async ({ data }) => {
    const member = await requireOwner();
    const invite = await invitePerson(await peopleStore(), {
      memberId: member.memberId,
      email: data.email,
      role: data.role,
      invitedByUserId: member.userId,
    });
    const emailSent = await emailInvite(member, invite);
    return { email: invite.email, refreshed: invite.refreshed, emailSent };
  });

export const resendPortalInvite = createServerFn({ method: "POST" })
  .inputValidator((data: { inviteId: string }) => ({ inviteId: data?.inviteId }))
  .handler(async ({ data }) => {
    const member = await requireOwner();
    const invite = await resendInvite(await peopleStore(), {
      memberId: member.memberId,
      inviteId: data.inviteId,
    });
    const emailSent = await emailInvite(member, invite);
    return { email: invite.email, emailSent };
  });

export const cancelPortalInvite = createServerFn({ method: "POST" })
  .inputValidator((data: { inviteId: string }) => ({ inviteId: data?.inviteId }))
  .handler(async ({ data }) => {
    const member = await requireOwner();
    await cancelInvite(await peopleStore(), { memberId: member.memberId, inviteId: data.inviteId });
    return { ok: true as const };
  });

export const removePortalPerson = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: string }) => ({ userId: data?.userId }))
  .handler(async ({ data }) => {
    const member = await requireOwner();
    await removePerson(await peopleStore(), { memberId: member.memberId, userId: data.userId });
    return { ok: true as const };
  });
