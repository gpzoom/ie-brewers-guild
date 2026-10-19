/**
 * The roster's "Re-invite" (owner, 2026-10-19): sends the invite email again
 * to someone who was invited but hasn't signed in yet. Nothing about the
 * account or its links changes; only the email goes out again, to the
 * address already on the account (never a new one -- a different person
 * means removing the old invite, not re-sending it). Minus the I/O so it's
 * testable (invite-member.server.ts wires Supabase and the email).
 *
 * A location of a one-manager business whose owner is the business manager
 * gets the Business invite again; any other location gets the Member invite.
 */
export type ResendInviteDeps = {
  loadMember: (memberId: string) => Promise<{
    businessName: string | null;
    business: { id: string; name: string; mode: "separate" | "one_manager"; managerUserId: string | null; locationCount: number } | null;
  }>;
  /** The member's owner-role user, or null when nobody has been invited. */
  loadOwnerUserId: (memberId: string) => Promise<string | null>;
  loadUser: (userId: string) => Promise<{ email: string | null; lastSignInAt: string | null } | null>;
  sendMemberInvite: (payload: { memberId: string; email: string; businessName: string | null }) => Promise<void>;
  sendBusinessInvite: (payload: { businessId: string; businessName: string; locationCount: number; email: string }) => Promise<void>;
};

export async function resendInviteCore(deps: ResendInviteDeps, memberId: string): Promise<{ ok: true; email: string }> {
  const member = await deps.loadMember(memberId);
  const business = member.business;
  const ownerUserId = await deps.loadOwnerUserId(memberId);

  const managed = business?.mode === "one_manager" && business.managerUserId !== null;
  const viaBusiness = managed && (ownerUserId === null || ownerUserId === business!.managerUserId);
  const userId = viaBusiness ? business!.managerUserId : ownerUserId;
  if (!userId) throw new Error("Nobody has been invited yet. Use Invite instead.");

  const user = await deps.loadUser(userId);
  const email = user?.email?.trim().toLowerCase();
  if (!email) throw new Error("The invited account has no email address.");
  if (user!.lastSignInAt) throw new Error(`${email} has already signed in, so there's no invite to send again.`);

  // Unlike the first Invite, a send failure is reported: sending is the whole job.
  if (viaBusiness) {
    await deps.sendBusinessInvite({
      businessId: business!.id,
      businessName: business!.name,
      locationCount: business!.locationCount,
      email,
    });
  } else {
    await deps.sendMemberInvite({ memberId, email, businessName: member.businessName?.trim() || null });
  }
  return { ok: true, email };
}
