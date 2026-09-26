import { describe, expect, it } from "vitest";
import {
  cancelInvite,
  invitePerson,
  loadPeople,
  normalizeInviteEmail,
  removePerson,
  resendInvite,
  type InvitePatch,
  type InviteRecord,
  type MemberUserRecord,
  type PeopleStore,
} from "@/lib/portal/people";

const MEMBER = "member-1";
const NOW = new Date("2026-09-26T12:00:00Z");

type StoredInvite = InviteRecord & { memberId: string; cancelledAt: string | null };

function memoryStore(seed: {
  users?: Array<MemberUserRecord & { email: string | null }>;
  invites?: StoredInvite[];
}) {
  const users = [...(seed.users ?? [])];
  const invites = [...(seed.invites ?? [])];
  let nextId = 1;
  const store: PeopleStore = {
    async listMemberUsers() {
      return users.map(({ userId, role, createdAt }) => ({ userId, role, createdAt }));
    },
    async userEmail(userId) {
      return users.find((u) => u.userId === userId)?.email ?? null;
    },
    async listOpenInvites(memberId) {
      return invites.filter((i) => i.memberId === memberId && i.cancelledAt === null);
    },
    async insertInvite(row) {
      const invite: StoredInvite = {
        id: `invite-${nextId++}`,
        memberId: row.memberId,
        email: row.email,
        role: row.role,
        expiresAt: row.expiresAt,
        createdAt: NOW.toISOString(),
        cancelledAt: null,
      };
      invites.push(invite);
      return invite;
    },
    async updateInvite(memberId, inviteId, patch: InvitePatch) {
      const invite = invites.find((i) => i.id === inviteId && i.memberId === memberId);
      if (!invite) throw new Error("not found");
      if (patch.role) invite.role = patch.role;
      if (patch.expiresAt) invite.expiresAt = patch.expiresAt;
      if (patch.cancelledAt) invite.cancelledAt = patch.cancelledAt;
    },
    async deleteMemberUser(_memberId, userId) {
      const index = users.findIndex((u) => u.userId === userId);
      users.splice(index, 1);
    },
  };
  return { store, users, invites };
}

const OWNER = {
  userId: "u-owner",
  role: "owner" as const,
  createdAt: "2026-09-01T00:00:00Z",
  email: "Owner@Brewery.com",
};
const EDITOR = {
  userId: "u-editor",
  role: "editor" as const,
  createdAt: "2026-09-10T00:00:00Z",
  email: "editor@brewery.com",
};
const PHOTOS = {
  userId: "u-photos",
  role: "media_events" as const,
  createdAt: "2026-09-05T00:00:00Z",
  email: "photos@brewery.com",
};

describe("normalizeInviteEmail", () => {
  it("trims and lower-cases", () => {
    expect(normalizeInviteEmail("  Sam@Example.COM ")).toBe("sam@example.com");
  });

  it("rejects anything that isn't an address", () => {
    expect(() => normalizeInviteEmail("sam")).toThrow("Enter a valid email address.");
    expect(() => normalizeInviteEmail("")).toThrow();
    expect(() => normalizeInviteEmail(42)).toThrow();
  });
});

describe("loadPeople", () => {
  it("lists the owner first, marks the viewer, and never offers to remove the owner", async () => {
    const { store } = memoryStore({ users: [EDITOR, PHOTOS, OWNER] });
    const view = await loadPeople(store, MEMBER, "u-owner", NOW);
    expect(view.people.map((p) => p.userId)).toEqual(["u-owner", "u-editor", "u-photos"]);
    expect(view.people[0]).toMatchObject({ isYou: true, canRemove: false });
    expect(view.people[1]).toMatchObject({ isYou: false, canRemove: true });
  });

  it("flags expired invites", async () => {
    const { store } = memoryStore({
      users: [OWNER],
      invites: [
        {
          id: "old",
          memberId: MEMBER,
          email: "a@b.co",
          role: "editor",
          expiresAt: "2026-09-20T00:00:00Z",
          createdAt: "2026-09-06T00:00:00Z",
          cancelledAt: null,
        },
      ],
    });
    const view = await loadPeople(store, MEMBER, "u-owner", NOW);
    expect(view.invites[0]).toMatchObject({ id: "old", expired: true });
  });
});

describe("invitePerson", () => {
  it("creates an invite that lasts 14 days", async () => {
    const { store, invites } = memoryStore({ users: [OWNER] });
    const result = await invitePerson(store, {
      memberId: MEMBER,
      email: " New@Person.com",
      role: "media_events",
      invitedByUserId: "u-owner",
      now: NOW,
    });
    expect(result).toMatchObject({ email: "new@person.com", role: "media_events", refreshed: false });
    expect(invites[0].expiresAt).toBe("2026-10-10T12:00:00.000Z");
  });

  it("refuses an address that already has access, whatever its case", async () => {
    const { store } = memoryStore({ users: [OWNER] });
    await expect(
      invitePerson(store, {
        memberId: MEMBER,
        email: "owner@brewery.com",
        role: "editor",
        invitedByUserId: "u-owner",
        now: NOW,
      }),
    ).rejects.toThrow("already has access");
  });

  it("refreshes an open invite to the same address instead of adding another", async () => {
    const { store, invites } = memoryStore({
      users: [OWNER],
      invites: [
        {
          id: "open",
          memberId: MEMBER,
          email: "sam@x.com",
          role: "media_events",
          expiresAt: "2026-09-20T00:00:00Z",
          createdAt: "2026-09-06T00:00:00Z",
          cancelledAt: null,
        },
      ],
    });
    const result = await invitePerson(store, {
      memberId: MEMBER,
      email: "Sam@X.com",
      role: "editor",
      invitedByUserId: "u-owner",
      now: NOW,
    });
    expect(result).toMatchObject({ inviteId: "open", refreshed: true, role: "editor" });
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({ role: "editor", expiresAt: "2026-10-10T12:00:00.000Z" });
  });

  it("never invites a second owner", async () => {
    const { store } = memoryStore({ users: [OWNER] });
    await expect(
      invitePerson(store, {
        memberId: MEMBER,
        email: "x@y.com",
        role: "owner",
        invitedByUserId: "u-owner",
        now: NOW,
      }),
    ).rejects.toThrow("Choose what they can edit.");
  });
});

describe("resendInvite and cancelInvite", () => {
  const pending = (): StoredInvite => ({
    id: "p1",
    memberId: MEMBER,
    email: "sam@x.com",
    role: "editor",
    expiresAt: "2026-09-27T00:00:00Z",
    createdAt: "2026-09-13T00:00:00Z",
    cancelledAt: null,
  });

  it("resend restarts the 14 days", async () => {
    const { store, invites } = memoryStore({ invites: [pending()] });
    const result = await resendInvite(store, { memberId: MEMBER, inviteId: "p1", now: NOW });
    expect(result).toEqual({ email: "sam@x.com", role: "editor" });
    expect(invites[0].expiresAt).toBe("2026-10-10T12:00:00.000Z");
  });

  it("cancel marks the invite canceled", async () => {
    const { store, invites } = memoryStore({ invites: [pending()] });
    await cancelInvite(store, { memberId: MEMBER, inviteId: "p1", now: NOW });
    expect(invites[0].cancelledAt).toBe(NOW.toISOString());
  });

  it("refuses an invite from another member, or one already canceled", async () => {
    const other = { ...pending(), memberId: "member-2" };
    const { store } = memoryStore({ invites: [other] });
    await expect(resendInvite(store, { memberId: MEMBER, inviteId: "p1" })).rejects.toThrow(
      "isn't pending",
    );
    await expect(cancelInvite(store, { memberId: MEMBER, inviteId: "p1" })).rejects.toThrow(
      "isn't pending",
    );
  });
});

describe("removePerson", () => {
  it("removes an editor", async () => {
    const { store, users } = memoryStore({ users: [OWNER, EDITOR] });
    await removePerson(store, { memberId: MEMBER, userId: "u-editor" });
    expect(users.map((u) => u.userId)).toEqual(["u-owner"]);
  });

  it("never removes the owner", async () => {
    const { store, users } = memoryStore({ users: [OWNER, EDITOR] });
    await expect(removePerson(store, { memberId: MEMBER, userId: "u-owner" })).rejects.toThrow(
      "The owner can't be removed",
    );
    expect(users).toHaveLength(2);
  });

  it("says so when the person is already gone", async () => {
    const { store } = memoryStore({ users: [OWNER] });
    await expect(removePerson(store, { memberId: MEMBER, userId: "u-editor" })).rejects.toThrow(
      "doesn't have access anymore",
    );
  });
});
