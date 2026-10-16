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
  type OpenInviteRole,
} from "@/lib/portal/people";
import { sendTransactionalEmail } from "@/lib/email/send";
import { ORG_NAME } from "@/lib/email/build-email-content";
import { recordAuditLogIfImpersonating } from "@/lib/guild/audit-log.server";

/**
 * The People section's actions (docs/member-profiles.md, "The People
 * section" and "Enforcement": "People actions are owner-only, checked in
 * the Worker"). Every call resolves the member from the SESSION and checks
 * the caller is its owner -- or a Guild admin editing as them, who acts
 * with owner rights -- before the service-role client is touched. The
 * browser only ever sends an email, a role, or the id of an invite or
 * person, and each of those is looked up within this member only.
 *
 * A Guild admin's actions while editing as the member are audit-logged
 * against them (spec, "Enforcement"); these writes use the service key,
 * so nothing in SQL would record them otherwise.
 */

async function requirePeopleAccess(): Promise<PortalMember> {
  const member = await requirePortalMember();
  if (member.role !== "owner" && !member.isBusinessManager) {
    throw new Error("Only the profile's owner or the business manager can manage people.");
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
  invite: { email: string; role: OpenInviteRole },
): Promise<boolean> {
  if (invite.role === "owner") return emailHandOff(member, invite.email);
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

async function emailHandOff(member: PortalMember, email: string): Promise<boolean> {
  try {
    const business = await (await peopleStore()).businessFor(member.memberId);
    if (!business) return false;
    await sendTransactionalEmail({
      trigger: "location_handoff_invited",
      memberId: member.memberId,
      businessName: business.name,
      city: business.city,
      email,
      managerLabel: (await inviterEmail(member)) ?? `The ${ORG_NAME}`,
    });
    return true;
  } catch (err) {
    console.error("People: couldn't send the hand-off email", err);
    return false;
  }
}

export const invitePortalPerson = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; role: InviteRole }) => ({
    email: data?.email,
    role: data?.role,
  }))
  .handler(async ({ data }) => {
    const member = await requirePeopleAccess();
    const invite = await invitePerson(await peopleStore(), {
      memberId: member.memberId,
      email: data.email,
      role: data.role,
      invitedByUserId: member.userId,
    });
    await recordAuditLogIfImpersonating({
      memberId: member.memberId,
      tableName: "member_invites",
      rowId: invite.inviteId,
      action: invite.refreshed ? "update" : "insert",
    });
    const emailSent = await emailInvite(member, invite);
    return { email: invite.email, refreshed: invite.refreshed, emailSent };
  });

export const resendPortalInvite = createServerFn({ method: "POST" })
  .inputValidator((data: { inviteId: string }) => ({ inviteId: data?.inviteId }))
  .handler(async ({ data }) => {
    const member = await requirePeopleAccess();
    const invite = await resendInvite(await peopleStore(), {
      memberId: member.memberId,
      inviteId: data.inviteId,
    });
    await recordAuditLogIfImpersonating({
      memberId: member.memberId,
      tableName: "member_invites",
      rowId: typeof data.inviteId === "string" ? data.inviteId : null,
      action: "update",
    });
    const emailSent = await emailInvite(member, invite);
    return { email: invite.email, emailSent };
  });

export const cancelPortalInvite = createServerFn({ method: "POST" })
  .inputValidator((data: { inviteId: string }) => ({ inviteId: data?.inviteId }))
  .handler(async ({ data }) => {
    const member = await requirePeopleAccess();
    await cancelInvite(await peopleStore(), { memberId: member.memberId, inviteId: data.inviteId });
    await recordAuditLogIfImpersonating({
      memberId: member.memberId,
      tableName: "member_invites",
      rowId: typeof data.inviteId === "string" ? data.inviteId : null,
      action: "update",
    });
    return { ok: true as const };
  });

export const removePortalPerson = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: string }) => ({ userId: data?.userId }))
  .handler(async ({ data }) => {
    const member = await requirePeopleAccess();
    await removePerson(await peopleStore(), { memberId: member.memberId, userId: data.userId });
    await recordAuditLogIfImpersonating({
      memberId: member.memberId,
      tableName: "member_users",
      rowId: typeof data.userId === "string" ? data.userId : null,
      action: "delete",
    });
    return { ok: true as const };
  });

// handOffLocation and takeBackLocation run on the caller's own session, so the
// SQL checks the right person. Both are audited in SQL (_business_audit),
// including for a Guild admin editing as them, so they don't call
// recordAuditLogIfImpersonating.
export const handOffLocation = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string }) => ({ email: data?.email }))
  .handler(async ({ data }) => {
    const member = await requirePeopleAccess();
    const supabase = await getSupabaseServerClientForRequest();
    const { data: result, error } = await supabase.rpc("hand_off_location", {
      p_member_id: member.memberId,
      p_email: typeof data.email === "string" ? data.email : "",
    });
    if (error) throw new Error(error.message);
    const invite = result as { invite_id: string; email: string; refreshed: boolean } | null;
    if (!invite || typeof invite !== "object" || typeof invite.email !== "string") {
      throw new Error("Couldn't save the hand-off. Try again.");
    }
    const emailSent = await emailHandOff(member, invite.email);
    return { email: invite.email, refreshed: invite.refreshed, emailSent };
  });

export const takeBackLocation = createServerFn({ method: "POST" }).handler(async () => {
  const member = await requirePeopleAccess();
  const supabase = await getSupabaseServerClientForRequest();
  const { error } = await supabase.rpc("take_back_location", { p_member_id: member.memberId });
  if (error) throw new Error(error.message);
  return { ok: true as const };
});
