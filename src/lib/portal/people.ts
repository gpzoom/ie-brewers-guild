import type { PortalRole } from "@/lib/portal/portal-destination";

/**
 * The owner's People section (docs/member-profiles.md, "The People
 * section"): who's on the profile, pending invites, invite, resend, cancel
 * and remove. The rules live here, against a small storage interface, so
 * they're testable without Supabase; portal-people.server.ts supplies the
 * real store (service-role client, after its own owner check) and sends
 * the emails.
 *
 * - Invites go to a Full editor or a Photos & events editor -- never a
 *   second owner (one owner per member; changing owner is a Guild job).
 * - An address that already has access can't be invited again.
 * - Inviting an address with an invite still open (pending or expired, not
 *   accepted or canceled) refreshes that invite instead of adding a second
 *   one -- the database allows one open invite per address per member.
 * - Invites last 14 days; Resend restarts the 14 days.
 * - The owner can't be removed (so the owner can't remove themselves).
 *   Changing someone's role is remove-and-reinvite, for now.
 */

export type InviteRole = "editor" | "media_events";

export const INVITE_ROLES: readonly InviteRole[] = ["media_events", "editor"];

export const INVITE_LIFETIME_DAYS = 14;

export function isInviteRole(value: unknown): value is InviteRole {
  return value === "editor" || value === "media_events";
}

export type MemberUserRecord = { userId: string; role: PortalRole; createdAt: string };

export type InviteRecord = {
  id: string;
  email: string;
  role: InviteRole;
  expiresAt: string;
  createdAt: string;
};

export type InvitePatch = {
  role?: InviteRole;
  expiresAt?: string;
  cancelledAt?: string;
  invitedByUserId?: string;
};

/** Where People reads and writes. Every method is scoped to one member. */
export interface PeopleStore {
  listMemberUsers(memberId: string): Promise<MemberUserRecord[]>;
  userEmail(userId: string): Promise<string | null>;
  /** Invites neither accepted nor canceled, expired ones included. */
  listOpenInvites(memberId: string): Promise<InviteRecord[]>;
  insertInvite(row: {
    memberId: string;
    email: string;
    role: InviteRole;
    invitedByUserId: string;
    expiresAt: string;
  }): Promise<InviteRecord>;
  updateInvite(memberId: string, inviteId: string, patch: InvitePatch): Promise<void>;
  deleteMemberUser(memberId: string, userId: string): Promise<void>;
}

// Deliberately simple, the same bar as member-email.server.ts: sign-in
// itself rejects anything it can't use.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed and lower-cased (sign-in compares addresses that way); throws a message for people. */
export function normalizeInviteEmail(raw: unknown): string {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  return email;
}

export function inviteExpiry(now: Date): string {
  return new Date(now.getTime() + INVITE_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export type PersonView = {
  userId: string;
  email: string | null;
  role: PortalRole;
  isYou: boolean;
  canRemove: boolean;
};

export type InviteView = {
  id: string;
  email: string;
  role: InviteRole;
  expiresAt: string;
  expired: boolean;
};

export type PeopleView = { people: PersonView[]; invites: InviteView[] };

const ROLE_ORDER: Record<PortalRole, number> = { owner: 0, editor: 1, media_events: 2 };

export async function loadPeople(
  store: PeopleStore,
  memberId: string,
  viewerUserId: string,
  now: Date = new Date(),
): Promise<PeopleView> {
  const [users, invites] = await Promise.all([
    store.listMemberUsers(memberId),
    store.listOpenInvites(memberId),
  ]);
  const emails = await Promise.all(users.map((user) => store.userEmail(user.userId)));
  const people = users
    .map((user, index) => ({ user, email: emails[index] }))
    .sort(
      (a, b) =>
        ROLE_ORDER[a.user.role] - ROLE_ORDER[b.user.role] ||
        a.user.createdAt.localeCompare(b.user.createdAt),
    )
    .map(({ user, email }) => ({
      userId: user.userId,
      email,
      role: user.role,
      isYou: user.userId === viewerUserId,
      canRemove: user.role !== "owner",
    }));
  return {
    people,
    invites: [...invites]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((invite) => ({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
        expired: new Date(invite.expiresAt).getTime() <= now.getTime(),
      })),
  };
}

/** Invites someone, or refreshes their open invite. Returns what the email needs. */
export async function invitePerson(
  store: PeopleStore,
  input: {
    memberId: string;
    email: unknown;
    role: unknown;
    invitedByUserId: string;
    now?: Date;
  },
): Promise<{ inviteId: string; email: string; role: InviteRole; refreshed: boolean }> {
  const email = normalizeInviteEmail(input.email);
  if (!isInviteRole(input.role)) throw new Error("Choose what they can edit.");
  const role = input.role;
  const now = input.now ?? new Date();

  const users = await store.listMemberUsers(input.memberId);
  const emails = await Promise.all(users.map((user) => store.userEmail(user.userId)));
  if (emails.some((existing) => existing?.trim().toLowerCase() === email)) {
    throw new Error("That person already has access to this profile.");
  }

  const expiresAt = inviteExpiry(now);
  const open = (await store.listOpenInvites(input.memberId)).find(
    (invite) => invite.email.trim().toLowerCase() === email,
  );
  if (open) {
    await store.updateInvite(input.memberId, open.id, {
      role,
      expiresAt,
      invitedByUserId: input.invitedByUserId,
    });
    return { inviteId: open.id, email, role, refreshed: true };
  }

  const created = await store.insertInvite({
    memberId: input.memberId,
    email,
    role,
    invitedByUserId: input.invitedByUserId,
    expiresAt,
  });
  return { inviteId: created.id, email, role, refreshed: false };
}

async function findOpenInvite(store: PeopleStore, memberId: string, inviteId: unknown) {
  const invite =
    typeof inviteId === "string"
      ? (await store.listOpenInvites(memberId)).find((row) => row.id === inviteId)
      : undefined;
  if (!invite) throw new Error("That invite isn't pending anymore.");
  return invite;
}

/** Resend: another 14 days from now. Returns what the email needs. */
export async function resendInvite(
  store: PeopleStore,
  input: { memberId: string; inviteId: unknown; now?: Date },
): Promise<{ email: string; role: InviteRole }> {
  const invite = await findOpenInvite(store, input.memberId, input.inviteId);
  await store.updateInvite(input.memberId, invite.id, {
    expiresAt: inviteExpiry(input.now ?? new Date()),
  });
  return { email: invite.email, role: invite.role };
}

export async function cancelInvite(
  store: PeopleStore,
  input: { memberId: string; inviteId: unknown; now?: Date },
): Promise<void> {
  const invite = await findOpenInvite(store, input.memberId, input.inviteId);
  await store.updateInvite(input.memberId, invite.id, {
    cancelledAt: (input.now ?? new Date()).toISOString(),
  });
}

/** Ends someone's access (on their next request). Never the owner. */
export async function removePerson(
  store: PeopleStore,
  input: { memberId: string; userId: unknown },
): Promise<void> {
  const users = await store.listMemberUsers(input.memberId);
  const target = users.find((user) => user.userId === input.userId);
  if (!target) throw new Error("That person doesn't have access anymore.");
  if (target.role === "owner") {
    throw new Error("The owner can't be removed. To change the owner, contact the Guild.");
  }
  await store.deleteMemberUser(input.memberId, target.userId);
}
