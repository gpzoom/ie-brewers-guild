/**
 * The Guild's "Invite" (roster), minus the I/O so it's testable
 * (invite-member.server.ts wires Supabase and the email).
 *
 * An email that already has an account -- someone who signed in on their
 * own from Member Portal before being invited (owner, 2026-10-05: Mars
 * Brewing's owner did) -- is linked as the member's owner instead of
 * failing with "already registered". An existing account is never deleted:
 * only an account this invite just created is removed again if linking it
 * fails.
 */
export type InviteDeps = {
  hasOwner: (memberId: string) => Promise<boolean>;
  createUser: (email: string) => Promise<{ ok: true; userId: string } | { ok: false; emailTaken: boolean; message: string }>;
  findUserIdByEmail: (email: string) => Promise<string | null>;
  /** ok when linked, or when that exact link already exists (a double-click). */
  linkOwner: (memberId: string, userId: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  deleteUser: (userId: string) => Promise<void>;
  sendInviteEmail: (memberId: string, email: string) => Promise<void>;
};

export async function inviteMemberCore(
  deps: InviteDeps,
  input: { memberId: string; email: string },
): Promise<{ ok: true; userId: string; existing: boolean }> {
  const email = input.email.trim().toLowerCase();

  // One owner per member. Checked first, so nothing is created -- and no
  // email sent -- for a member that already has one.
  if (await deps.hasOwner(input.memberId)) {
    throw new Error("This member already has an owner. They can add more people from their portal.");
  }

  let userId: string;
  let existing = false;
  const created = await deps.createUser(email);
  if (created.ok) {
    userId = created.userId;
  } else if (created.emailTaken) {
    const found = await deps.findUserIdByEmail(email);
    if (!found) throw new Error(created.message || "Could not send the invite.");
    userId = found;
    existing = true;
  } else {
    throw new Error(created.message || "Could not send the invite.");
  }

  const linked = await deps.linkOwner(input.memberId, userId);
  if (!linked.ok) {
    if (!existing) {
      await deps.deleteUser(userId).catch((err) => {
        console.error("inviteMember: failed to roll back the new auth user after the link failed", err);
      });
    }
    throw new Error(linked.message);
  }

  try {
    await deps.sendInviteEmail(input.memberId, email);
  } catch (err) {
    // Same as every other transactional email: a send failure never undoes the invite.
    console.error("sendTransactionalEmail(member_invited) failed", err);
  }

  return { ok: true, userId, existing };
}
