/**
 * The roster's one Invite for a one-manager business (spec 2026-10-15), and
 * the "Switch to one manager" box (with `switching` the business must still
 * be separate, and `linkManager` does the whole switch), minus the I/O so it's testable (businesses.server.ts wires Supabase and
 * the email). Same account rules as the member invite
 * (invite-member-core.ts): an email that already has an account is linked,
 * never deleted; only an account this invite just created is removed again
 * if linking fails.
 */
export type BusinessInviteDeps = {
  loadBusiness: (businessId: string) => Promise<{
    name: string;
    mode: "separate" | "one_manager";
    managerUserId: string | null;
    locationCount: number;
  }>;
  createUser: (email: string) => Promise<{ ok: true; userId: string } | { ok: false; emailTaken: boolean; message: string }>;
  findUserIdByEmail: (email: string) => Promise<string | null>;
  linkManager: (businessId: string, userId: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  deleteUser: (userId: string) => Promise<void>;
  sendInviteEmail: (payload: { businessId: string; businessName: string; locationCount: number; email: string }) => Promise<void>;
};

export async function inviteBusinessManagerCore(
  deps: BusinessInviteDeps,
  input: { businessId: string; email: string; switching?: boolean },
): Promise<{ ok: true; userId: string; existing: boolean }> {
  const email = input.email.trim().toLowerCase();

  const business = await deps.loadBusiness(input.businessId);
  if (input.switching) {
    if (business.mode !== "separate") throw new Error("This business already has one manager.");
  } else {
    if (business.mode !== "one_manager") throw new Error("Set this business to One manager first.");
    if (business.managerUserId) throw new Error("This business already has a manager.");
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

  const linked = await deps.linkManager(input.businessId, userId);
  if (!linked.ok) {
    if (!existing) {
      await deps.deleteUser(userId).catch((err) => {
        console.error("inviteBusinessManager: failed to roll back the new auth user after the link failed", err);
      });
    }
    throw new Error(linked.message);
  }

  try {
    await deps.sendInviteEmail({ businessId: input.businessId, businessName: business.name, locationCount: business.locationCount, email });
  } catch (err) {
    console.error("sendTransactionalEmail(business_invited) failed", err);
  }

  return { ok: true, userId, existing };
}
