import { INVITE_LIFETIME_DAYS, INVITE_RESEND_COOLDOWN_MINUTES, normalizeInviteEmail } from "@/lib/portal/people";

/**
 * The super admin's Guild admins screen (docs/member-profiles.md, "Super
 * admin" > "Guild admins screen"): who has Guild admin access, invite by
 * email, resend or cancel an invite, remove access. The rules live here,
 * against a small storage interface, so they're testable without Supabase;
 * guild-admins.server.ts supplies the real store (service-role client) and
 * runs the super admin check BEFORE building it. Accepting an invite runs
 * in the sign-in callback, for the signed-in person's own verified address.
 *
 * - Access is granted when the invitee signs in with the invited address,
 *   not when the invite is sent. Invites last 14 days; Resend restarts them
 *   (at most once every few minutes, like member invites).
 * - Remove access turns is_guild_admin off; it doesn't delete the account,
 *   and takes effect on that person's next request.
 * - The super admin's row can't be removed (the database refuses it too).
 * - Every invite, grant and removal is written to the audit log, with the
 *   address in `details` so the log reads without a lookup.
 */

export type GuildAdminRecord = {
  userId: string;
  isSuperAdmin: boolean;
  /** When access was last turned on (the profiles row's updated_at). */
  addedAt: string;
};

export type GuildAdminInviteRecord = {
  id: string;
  email: string;
  expiresAt: string;
  updatedAt: string;
  invitedByUserId: string | null;
};

export type GuildAdminAudit = {
  actorUserId: string;
  tableName: "profiles" | "guild_admin_invites";
  rowId: string;
  action: "insert" | "update";
  details: { email: string; change: string };
};

export interface GuildAdminStore {
  listAdmins(): Promise<GuildAdminRecord[]>;
  account(userId: string): Promise<{ email: string | null; lastSignInAt: string | null }>;
  /** The account id for an address, if there is one. */
  findUserIdByEmail(email: string): Promise<string | null>;
  isGuildAdmin(userId: string): Promise<{ isGuildAdmin: boolean; isSuperAdmin: boolean }>;
  setGuildAdmin(userId: string, value: boolean): Promise<void>;
  /** Neither accepted nor canceled, expired included. */
  listOpenInvites(): Promise<GuildAdminInviteRecord[]>;
  insertInvite(row: { email: string; invitedByUserId: string; expiresAt: string }): Promise<GuildAdminInviteRecord>;
  updateInvite(
    id: string,
    patch: { expiresAt?: string; cancelledAt?: string; acceptedAt?: string; acceptedUserId?: string; invitedByUserId?: string },
  ): Promise<void>;
  audit(entry: GuildAdminAudit): Promise<void>;
}

function expiry(now: Date): string {
  return new Date(now.getTime() + INVITE_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function assertCooledDown(invite: GuildAdminInviteRecord, now: Date) {
  if (now.getTime() - new Date(invite.updatedAt).getTime() < INVITE_RESEND_COOLDOWN_MINUTES * 60 * 1000) {
    throw new Error(`An invite just went to ${invite.email}. You can send it again in a few minutes.`);
  }
}

export type GuildAdminView = {
  userId: string;
  email: string | null;
  isSuperAdmin: boolean;
  isYou: boolean;
  addedAt: string;
  lastSignInAt: string | null;
  canRemove: boolean;
};

export type GuildAdminInviteView = { id: string; email: string; expiresAt: string; expired: boolean };

export type GuildAdminsView = { admins: GuildAdminView[]; invites: GuildAdminInviteView[] };

export async function loadGuildAdmins(
  store: GuildAdminStore,
  viewerUserId: string,
  now: Date = new Date(),
): Promise<GuildAdminsView> {
  const [admins, invites] = await Promise.all([store.listAdmins(), store.listOpenInvites()]);
  const accounts = await Promise.all(admins.map((admin) => store.account(admin.userId)));
  return {
    admins: admins
      .map((admin, index) => ({
        userId: admin.userId,
        email: accounts[index].email,
        isSuperAdmin: admin.isSuperAdmin,
        isYou: admin.userId === viewerUserId,
        addedAt: admin.addedAt,
        lastSignInAt: accounts[index].lastSignInAt,
        canRemove: !admin.isSuperAdmin,
      }))
      .sort((a, b) => Number(b.isSuperAdmin) - Number(a.isSuperAdmin) || a.addedAt.localeCompare(b.addedAt)),
    invites: invites
      .map((invite) => ({
        id: invite.id,
        email: invite.email,
        expiresAt: invite.expiresAt,
        expired: new Date(invite.expiresAt).getTime() <= now.getTime(),
      }))
      .sort((a, b) => a.email.localeCompare(b.email)),
  };
}

/** Invites someone, or refreshes their open invite. Returns what the email needs. */
export async function inviteGuildAdmin(
  store: GuildAdminStore,
  input: { email: unknown; actorUserId: string; now?: Date },
): Promise<{ inviteId: string; email: string; refreshed: boolean }> {
  const email = normalizeInviteEmail(input.email);
  const now = input.now ?? new Date();

  const existingUserId = await store.findUserIdByEmail(email);
  if (existingUserId && (await store.isGuildAdmin(existingUserId)).isGuildAdmin) {
    throw new Error("That person is already a Guild admin.");
  }

  const open = (await store.listOpenInvites()).find((invite) => invite.email === email);
  if (open) {
    assertCooledDown(open, now);
    await store.updateInvite(open.id, { expiresAt: expiry(now), invitedByUserId: input.actorUserId });
    await store.audit({
      actorUserId: input.actorUserId,
      tableName: "guild_admin_invites",
      rowId: open.id,
      action: "update",
      details: { email, change: "invite resent" },
    });
    return { inviteId: open.id, email, refreshed: true };
  }

  const created = await store.insertInvite({ email, invitedByUserId: input.actorUserId, expiresAt: expiry(now) });
  await store.audit({
    actorUserId: input.actorUserId,
    tableName: "guild_admin_invites",
    rowId: created.id,
    action: "insert",
    details: { email, change: "invited as a Guild admin" },
  });
  return { inviteId: created.id, email, refreshed: false };
}

async function findOpenInvite(store: GuildAdminStore, inviteId: unknown) {
  const invite =
    typeof inviteId === "string" ? (await store.listOpenInvites()).find((row) => row.id === inviteId) : undefined;
  if (!invite) throw new Error("That invite isn't pending anymore.");
  return invite;
}

export async function resendGuildAdminInvite(
  store: GuildAdminStore,
  input: { inviteId: unknown; actorUserId: string; now?: Date },
): Promise<{ email: string }> {
  const invite = await findOpenInvite(store, input.inviteId);
  const now = input.now ?? new Date();
  assertCooledDown(invite, now);
  await store.updateInvite(invite.id, { expiresAt: expiry(now) });
  await store.audit({
    actorUserId: input.actorUserId,
    tableName: "guild_admin_invites",
    rowId: invite.id,
    action: "update",
    details: { email: invite.email, change: "invite resent" },
  });
  return { email: invite.email };
}

export async function cancelGuildAdminInvite(
  store: GuildAdminStore,
  input: { inviteId: unknown; actorUserId: string; now?: Date },
): Promise<void> {
  const invite = await findOpenInvite(store, input.inviteId);
  await store.updateInvite(invite.id, { cancelledAt: (input.now ?? new Date()).toISOString() });
  await store.audit({
    actorUserId: input.actorUserId,
    tableName: "guild_admin_invites",
    rowId: invite.id,
    action: "update",
    details: { email: invite.email, change: "invite canceled" },
  });
}

/** Turns Guild admin access off. Never the super admin. */
export async function removeGuildAdmin(
  store: GuildAdminStore,
  input: { userId: unknown; actorUserId: string },
): Promise<void> {
  if (typeof input.userId !== "string") throw new Error("That person isn't a Guild admin.");
  const status = await store.isGuildAdmin(input.userId);
  if (status.isSuperAdmin) throw new Error("The super admin's access can't be removed.");
  if (!status.isGuildAdmin) throw new Error("That person isn't a Guild admin anymore.");
  const { email } = await store.account(input.userId);
  await store.setGuildAdmin(input.userId, false);
  await store.audit({
    actorUserId: input.actorUserId,
    tableName: "profiles",
    rowId: input.userId,
    action: "update",
    details: { email: email ?? "unknown address", change: "Guild admin access removed" },
  });
}

/**
 * At sign-in: accepts the signed-in person's open, unexpired Guild admin
 * invite, turning access on. `user` comes from the verified session, never
 * from input. The grant is audited against whoever sent the invite.
 */
export async function acceptGuildAdminInvites(
  store: GuildAdminStore,
  user: { id: string; email: string | null | undefined },
  now: Date = new Date(),
): Promise<{ granted: boolean }> {
  const email = user.email?.trim().toLowerCase();
  if (!email) return { granted: false };
  const invite = (await store.listOpenInvites()).find(
    (row) => row.email === email && new Date(row.expiresAt).getTime() > now.getTime(),
  );
  if (!invite) return { granted: false };

  await store.setGuildAdmin(user.id, true);
  await store.updateInvite(invite.id, { acceptedAt: now.toISOString(), acceptedUserId: user.id });
  await store.audit({
    actorUserId: invite.invitedByUserId ?? user.id,
    tableName: "profiles",
    rowId: user.id,
    action: "update",
    details: { email, change: "Guild admin access granted (invite accepted)" },
  });
  return { granted: true };
}
