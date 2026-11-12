import type { PortalRole } from "@/lib/portal/portal-destination";

/**
 * The owner's People section (docs/member-profiles.md, "The People
 * section"): who's on the profile, pending invites, invite, resend, cancel
 * and remove. The rules live here, against a small storage interface, so
 * they're testable without Supabase; portal-people.server.ts supplies the
 * real store (service-role client, after its own owner check) and sends
 * the emails.
 *
 * - Invites go to a Co-owner, a Full editor or a Photos & events editor --
 *   never a second owner (one owner per member; changing owner is a Guild job).
 * - Only the owner (or a Guild admin editing as them, whose portal role is
 *   "owner") may invite, resend, cancel, remove or change a co-owner or a
 *   pending co-owner invite. A co-owner, or a business manager on a
 *   handed-off location (role editor), manages editors only.
 * - An address that already has access can't be invited again.
 * - Inviting an address with an invite still open (pending or expired, not
 *   accepted or canceled) refreshes that invite instead of adding a second
 *   one -- the database allows one open invite per address per member.
 * - Invites last 14 days; Resend restarts the 14 days. The same invite
 *   can be sent again only after a few minutes (INVITE_RESEND_COOLDOWN_MINUTES).
 * - The owner can't be removed or changed (so the owner can't remove
 *   themselves). Everyone else's role can be changed with changeAccess.
 * - Anyone but the owner and the business manager can leave the profile.
 * - In a one-manager business the business manager (businesses.manager_user_id)
 *   is listed first, labeled for all locations, and can't be removed here.
 *   After a hand-off the location manager is the location's owner and the
 *   business manager is an editor.
 * - A hand-off is an open invite with role "owner", written only by the SQL
 *   function hand_off_location; invitePerson never creates one and refuses
 *   an address that has one waiting.
 */

export type InviteRole = "co_owner" | "editor" | "media_events";

export const INVITE_ROLES: readonly InviteRole[] = ["co_owner", "editor", "media_events"];

export const INVITE_LIFETIME_DAYS = 14;

/**
 * An invite email to the same address goes out at most once per this
 * many minutes, so Resend can't be used to flood someone's inbox with
 * Guild-branded mail.
 */
export const INVITE_RESEND_COOLDOWN_MINUTES = 5;

function assertCooledDown(invite: InviteRecord, now: Date) {
  const last = new Date(invite.updatedAt).getTime();
  if (now.getTime() - last < INVITE_RESEND_COOLDOWN_MINUTES * 60 * 1000) {
    throw new Error(
      `An invite just went to ${invite.email}. You can send it again in a few minutes.`,
    );
  }
}

export function isInviteRole(value: unknown): value is InviteRole {
  return value === "co_owner" || value === "editor" || value === "media_events";
}

/** Who is acting on People: the signed-in user's role on this member. */
export type PeopleActor = { userId: string; role: PortalRole; isBusinessManager: boolean };

const CO_OWNER_FORBIDDEN = "Only the owner can add or change co-owners.";
const OWNER_UNTOUCHABLE = "The owner can't be removed. To change the owner, contact the Guild.";

/**
 * Only the owner -- including a Guild admin editing as them, whose portal
 * role is "owner" -- adds, changes or removes co-owners. A business manager
 * on a handed-off location has role editor, so manages editors only.
 */
export function canManageCoOwners(actor: PeopleActor): boolean {
  return actor.role === "owner";
}

/** The roles this person may invite someone as (or change someone to), in picker order. */
export function inviteRolesFor(actor: PeopleActor): InviteRole[] {
  return INVITE_ROLES.filter((role) => role !== "co_owner" || canManageCoOwners(actor));
}

function assertMayTouchRole(actor: PeopleActor, role: OpenInviteRole | PortalRole) {
  if (role === "co_owner" && !canManageCoOwners(actor)) throw new Error(CO_OWNER_FORBIDDEN);
}

/** Open invites may also be a hand-off (owner), made by the business manager in SQL. */
export type OpenInviteRole = InviteRole | "owner";

export function isOpenInviteRole(value: unknown): value is OpenInviteRole {
  return value === "owner" || isInviteRole(value);
}

/** The one-manager business a location is part of, as People needs it. */
export type PeopleBusiness = {
  name: string;
  city: string;
  locationCount: number;
  managerUserId: string | null;
};

export type PeopleBusinessView = {
  name: string;
  city: string;
  locationCount: number;
  /** The business manager, or a Guild admin editing as them. */
  viewerIsManager: boolean;
  /** Set once the location is handed off. */
  locationManagerEmail: string | null;
  handOffPending: boolean;
  canHandOff: boolean;
  canTakeBack: boolean;
};

/** The wording of the hand-off card, handed-off card and take-back dialog (BZ4). */
export function peopleBusinessCopy(business: PeopleBusinessView) {
  const { city } = business;
  const who = business.locationManagerEmail ?? "They";
  return {
    handOffHelp: `They'll manage ${city} only. You keep access, and the logo, cover and theme stay shared.`,
    handedOffTitle: `${city} is handed off`,
    handedOffBody: `${who} manage${business.locationManagerEmail ? "s" : ""} ${city}. You still have access.`,
    takeBackTitle: `Take back ${city}?`,
    takeBackBody: `${who} will no longer be able to edit ${city}, and you'll manage it again.`,
  };
}

export type MemberUserRecord = { userId: string; role: PortalRole; createdAt: string };

export type InviteRecord = {
  id: string;
  email: string;
  role: OpenInviteRole;
  expiresAt: string;
  createdAt: string;
  /** When it was last sent (created, refreshed or resent). */
  updatedAt: string;
};

export type InvitePatch = {
  role?: OpenInviteRole;
  expiresAt?: string;
  cancelledAt?: string;
  invitedByUserId?: string;
};

/** Where People reads and writes. Every method is scoped to one member. */
export interface PeopleStore {
  /** The location's business when it is managed by one manager; null otherwise. */
  businessFor(memberId: string): Promise<PeopleBusiness | null>;
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
  /** Never touches the owner's row. */
  updateMemberUserRole(memberId: string, userId: string, role: InviteRole): Promise<void>;
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
  canChangeAccess: boolean;
  /** The viewer's own row, when they may leave the profile. */
  canLeave: boolean;
  /** The roles the viewer may change this person to; empty unless canChangeAccess. */
  accessOptions: InviteRole[];
  label: string;
  isBusinessManager: boolean;
};

export type InviteView = {
  id: string;
  email: string;
  role: OpenInviteRole;
  expiresAt: string;
  expired: boolean;
};

export type PeopleView = {
  people: PersonView[];
  invites: InviteView[];
  business: PeopleBusinessView | null;
  /** The roles the viewer may invite someone as. */
  inviteRoles: InviteRole[];
};

const ROLE_ORDER: Record<PortalRole, number> = { owner: 0, co_owner: 1, editor: 2, media_events: 3 };

export const PLAIN_LABEL: Record<PortalRole, string> = {
  owner: "Owner",
  co_owner: "Co-owner",
  editor: "Full editor",
  media_events: "Photos & events",
};

function personLabel(
  role: PortalRole,
  isManager: boolean,
  business: PeopleBusiness | null,
): string {
  if (!business) return PLAIN_LABEL[role];
  if (isManager) return `Business manager · all ${business.locationCount} locations`;
  if (role === "owner") return `Location manager · ${business.city}`;
  if (role === "co_owner") return `Co-owner · ${business.city}`;
  return `${role === "editor" ? "Full editor" : "Photos & events editor"} · ${business.city}`;
}

export async function loadPeople(
  store: PeopleStore,
  memberId: string,
  viewer: PeopleActor,
  now: Date = new Date(),
  options: { viewerIsGuildAdmin?: boolean } = {},
): Promise<PeopleView> {
  const [users, invites, business] = await Promise.all([
    store.listMemberUsers(memberId),
    store.listOpenInvites(memberId),
    store.businessFor(memberId),
  ]);
  const emails = await Promise.all(users.map((user) => store.userEmail(user.userId)));
  const isManagerUser = (userId: string) => business !== null && business.managerUserId === userId;
  const inviteRoles = inviteRolesFor(viewer);
  const people: PersonView[] = users
    .map((user, index) => ({ user, email: emails[index] }))
    .sort(
      (a, b) =>
        Number(isManagerUser(b.user.userId)) - Number(isManagerUser(a.user.userId)) ||
        ROLE_ORDER[a.user.role] - ROLE_ORDER[b.user.role] ||
        a.user.createdAt.localeCompare(b.user.createdAt),
    )
    .map(({ user, email }) => {
      const isBusinessManager = isManagerUser(user.userId);
      const isYou = user.userId === viewer.userId;
      // The same rules removePerson and changeAccess enforce.
      const manageable =
        user.role !== "owner" &&
        !isBusinessManager &&
        (user.role !== "co_owner" || canManageCoOwners(viewer));
      const accessOptions = manageable ? inviteRoles.filter((role) => role !== user.role) : [];
      return {
        userId: user.userId,
        email,
        role: user.role,
        isYou,
        canRemove: manageable,
        canChangeAccess: accessOptions.length > 0,
        canLeave: isYou && user.role !== "owner" && !isBusinessManager,
        accessOptions,
        label: personLabel(user.role, isBusinessManager, business),
        isBusinessManager,
      };
    });

  let businessView: PeopleBusinessView | null = null;
  if (business) {
    const owner = users.find((user) => user.role === "owner");
    const handedOff = Boolean(
      owner && business.managerUserId && owner.userId !== business.managerUserId,
    );
    const handOffPending = invites.some((invite) => invite.role === "owner");
    const viewerIsManager =
      Boolean(options.viewerIsGuildAdmin) ||
      (business.managerUserId !== null && business.managerUserId === viewer.userId);
    businessView = {
      name: business.name,
      city: business.city,
      locationCount: business.locationCount,
      viewerIsManager,
      locationManagerEmail: handedOff
        ? (people.find((p) => p.userId === owner?.userId)?.email ?? null)
        : null,
      handOffPending,
      canHandOff:
        viewerIsManager && business.managerUserId !== null && !handedOff && !handOffPending,
      canTakeBack: viewerIsManager && handedOff,
    };
  }

  return {
    business: businessView,
    inviteRoles,
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
    actor: PeopleActor;
    now?: Date;
  },
): Promise<{ inviteId: string; email: string; role: InviteRole; refreshed: boolean }> {
  const email = normalizeInviteEmail(input.email);
  if (!isInviteRole(input.role)) throw new Error("Choose what they can edit.");
  const role = input.role;
  assertMayTouchRole(input.actor, role);
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
  if (open?.role === "owner") {
    throw new Error(
      "That address has a hand-off waiting. Cancel it first to invite them as an editor.",
    );
  }
  if (open) {
    // Re-inviting would re-role a pending co-owner invite.
    assertMayTouchRole(input.actor, open.role);
    assertCooledDown(open, now);
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
  input: { memberId: string; inviteId: unknown; actor: PeopleActor; now?: Date },
): Promise<{ email: string; role: OpenInviteRole }> {
  const invite = await findOpenInvite(store, input.memberId, input.inviteId);
  assertMayTouchRole(input.actor, invite.role);
  const now = input.now ?? new Date();
  assertCooledDown(invite, now);
  await store.updateInvite(input.memberId, invite.id, { expiresAt: inviteExpiry(now) });
  return { email: invite.email, role: invite.role };
}

export async function cancelInvite(
  store: PeopleStore,
  input: { memberId: string; inviteId: unknown; actor: PeopleActor; now?: Date },
): Promise<void> {
  const invite = await findOpenInvite(store, input.memberId, input.inviteId);
  assertMayTouchRole(input.actor, invite.role);
  await store.updateInvite(input.memberId, invite.id, {
    cancelledAt: (input.now ?? new Date()).toISOString(),
  });
}

/** Ends someone's access (on their next request). Never the owner. */
export async function removePerson(
  store: PeopleStore,
  input: { memberId: string; userId: unknown; actor: PeopleActor },
): Promise<void> {
  const users = await store.listMemberUsers(input.memberId);
  const target = users.find((user) => user.userId === input.userId);
  if (!target) throw new Error("That person doesn't have access anymore.");
  const business = await store.businessFor(input.memberId);
  if (business && business.managerUserId === target.userId) {
    throw new Error(
      `The business manager can't be removed here. To change who manages ${business.name}, contact the Guild.`,
    );
  }
  if (target.role === "owner") throw new Error(OWNER_UNTOUCHABLE);
  assertMayTouchRole(input.actor, target.role);
  await store.deleteMemberUser(input.memberId, target.userId);
}

/** Changes someone's level without remove-and-reinvite. Never the owner or the business manager. */
export async function changeAccess(
  store: PeopleStore,
  input: { memberId: string; userId: unknown; role: unknown; actor: PeopleActor },
): Promise<{ fromRole: PortalRole; toRole: InviteRole }> {
  if (!isInviteRole(input.role)) throw new Error("Choose what they can edit.");
  const role = input.role;
  const users = await store.listMemberUsers(input.memberId);
  const target = users.find((user) => user.userId === input.userId);
  if (!target) throw new Error("That person doesn't have access anymore.");
  const business = await store.businessFor(input.memberId);
  if (business && business.managerUserId === target.userId) {
    throw new Error("The business manager's access can't be changed here. Contact the Guild.");
  }
  if (target.role === "owner") throw new Error(OWNER_UNTOUCHABLE);
  // Moving someone to or from co-owner is the owner's call.
  assertMayTouchRole(input.actor, target.role);
  assertMayTouchRole(input.actor, role);
  if (target.role === role) throw new Error("They already have that access.");
  await store.updateMemberUserRole(input.memberId, target.userId, role);
  return { fromRole: target.role, toRole: role };
}

/** Ends the actor's own access. Never the owner or the business manager. */
export async function leaveProfile(
  store: PeopleStore,
  input: { memberId: string; actor: PeopleActor },
): Promise<{ role: PortalRole }> {
  const users = await store.listMemberUsers(input.memberId);
  const self = users.find((user) => user.userId === input.actor.userId);
  if (!self) throw new Error("You don't have access to this profile anymore.");
  const business = await store.businessFor(input.memberId);
  if (business && business.managerUserId === self.userId) {
    throw new Error("The business manager can't leave here. Contact the Guild.");
  }
  if (self.role === "owner") {
    throw new Error("The owner can't leave the profile. To change the owner, contact the Guild.");
  }
  await store.deleteMemberUser(input.memberId, self.userId);
  return { role: self.role };
}
