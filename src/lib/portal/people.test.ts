import { describe, expect, it } from "vitest";
import {
  cancelInvite,
  changeAccess,
  invitePerson,
  leaveProfile,
  loadPeople,
  normalizeInviteEmail,
  peopleBusinessCopy,
  removePerson,
  resendInvite,
  type InvitePatch,
  type InviteRecord,
  type MemberUserRecord,
  type PeopleActor,
  type PeopleBusiness,
  type PeopleStore,
} from "@/lib/portal/people";

const MEMBER = "member-1";
const NOW = new Date("2026-09-26T12:00:00Z");

type StoredInvite = InviteRecord & { memberId: string; cancelledAt: string | null };

function memoryStore(seed: {
  users?: Array<MemberUserRecord & { email: string | null }>;
  invites?: StoredInvite[];
  business?: PeopleBusiness | null;
}) {
  // Copies, so a role change never leaks into the shared fixtures.
  const users = (seed.users ?? []).map((user) => ({ ...user }));
  const invites = [...(seed.invites ?? [])];
  let nextId = 1;
  const store: PeopleStore = {
    async businessFor() {
      return seed.business ?? null;
    },
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
        updatedAt: NOW.toISOString(),
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
      invite.updatedAt = NOW.toISOString();
      if (patch.cancelledAt) invite.cancelledAt = patch.cancelledAt;
    },
    // Like the Supabase store: the write only lands while the row still has
    // the role that was read, and reports whether it did.
    async deleteMemberUser(_memberId, userId, expectedRole) {
      const index = users.findIndex(
        (u) => u.userId === userId && u.role === expectedRole && u.role !== "owner",
      );
      if (index === -1) return false;
      users.splice(index, 1);
      return true;
    },
    async updateMemberUserRole(_memberId, userId, role, expectedRole) {
      const user = users.find(
        (u) => u.userId === userId && u.role === expectedRole && u.role !== "owner",
      );
      if (!user) return false;
      user.role = role;
      return true;
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

const AS_OWNER: PeopleActor = { userId: "u-owner", role: "owner", isBusinessManager: false };
const actorFor = (userId: string, role: PeopleActor["role"], isBusinessManager = false) => ({
  userId,
  role,
  isBusinessManager,
});

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
    const view = await loadPeople(store, MEMBER, AS_OWNER, NOW);
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
          updatedAt: "2026-09-06T00:00:00Z",
          cancelledAt: null,
        },
      ],
    });
    const view = await loadPeople(store, MEMBER, AS_OWNER, NOW);
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
      actor: AS_OWNER,
      now: NOW,
    });
    expect(result).toMatchObject({
      email: "new@person.com",
      role: "media_events",
      refreshed: false,
    });
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
        actor: AS_OWNER,
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
          updatedAt: "2026-09-06T00:00:00Z",
          cancelledAt: null,
        },
      ],
    });
    const result = await invitePerson(store, {
      memberId: MEMBER,
      email: "Sam@X.com",
      role: "editor",
      invitedByUserId: "u-owner",
      actor: AS_OWNER,
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
        actor: AS_OWNER,
        now: NOW,
      }),
    ).rejects.toThrow("Choose what they can edit.");
  });
});

describe("resendInvite and cancelInvite", () => {
  it("won't send the same invite again within a few minutes", async () => {
    const recent = { ...pending(), updatedAt: "2026-09-26T11:58:00Z" };
    const { store } = memoryStore({ invites: [recent] });
    await expect(
      resendInvite(store, { memberId: MEMBER, inviteId: "p1", actor: AS_OWNER, now: NOW }),
    ).rejects.toThrow("send it again in a few minutes");
    await expect(
      invitePerson(store, {
        memberId: MEMBER,
        email: "sam@x.com",
        role: "editor",
        invitedByUserId: "u-owner",
        actor: AS_OWNER,
        now: NOW,
      }),
    ).rejects.toThrow("send it again in a few minutes");
  });

  const pending = (): StoredInvite => ({
    id: "p1",
    memberId: MEMBER,
    email: "sam@x.com",
    role: "editor",
    expiresAt: "2026-09-27T00:00:00Z",
    createdAt: "2026-09-13T00:00:00Z",
    updatedAt: "2026-09-13T00:00:00Z",
    cancelledAt: null,
  });

  it("resend restarts the 14 days", async () => {
    const { store, invites } = memoryStore({ invites: [pending()] });
    const result = await resendInvite(store, {
      memberId: MEMBER,
      inviteId: "p1",
      actor: AS_OWNER,
      now: NOW,
    });
    expect(result).toEqual({ email: "sam@x.com", role: "editor" });
    expect(invites[0].expiresAt).toBe("2026-10-10T12:00:00.000Z");
  });

  it("cancel marks the invite canceled", async () => {
    const { store, invites } = memoryStore({ invites: [pending()] });
    await cancelInvite(store, { memberId: MEMBER, inviteId: "p1", actor: AS_OWNER, now: NOW });
    expect(invites[0].cancelledAt).toBe(NOW.toISOString());
  });

  it("refuses an invite from another member, or one already canceled", async () => {
    const other = { ...pending(), memberId: "member-2" };
    const { store } = memoryStore({ invites: [other] });
    await expect(
      resendInvite(store, { memberId: MEMBER, inviteId: "p1", actor: AS_OWNER }),
    ).rejects.toThrow("isn't pending");
    await expect(
      cancelInvite(store, { memberId: MEMBER, inviteId: "p1", actor: AS_OWNER }),
    ).rejects.toThrow("isn't pending");
  });
});

describe("removePerson", () => {
  it("removes an editor", async () => {
    const { store, users } = memoryStore({ users: [OWNER, EDITOR] });
    await removePerson(store, { memberId: MEMBER, userId: "u-editor", actor: AS_OWNER });
    expect(users.map((u) => u.userId)).toEqual(["u-owner"]);
  });

  it("never removes the owner", async () => {
    const { store, users } = memoryStore({ users: [OWNER, EDITOR] });
    await expect(
      removePerson(store, { memberId: MEMBER, userId: "u-owner", actor: AS_OWNER }),
    ).rejects.toThrow("The owner can't be removed");
    expect(users).toHaveLength(2);
  });

  it("says so when the person is already gone", async () => {
    const { store } = memoryStore({ users: [OWNER] });
    await expect(
      removePerson(store, { memberId: MEMBER, userId: "u-editor", actor: AS_OWNER }),
    ).rejects.toThrow("doesn't have access anymore");
  });
});

describe("People in a one-manager business (spec 2026-10-15, BZ4)", () => {
  const business = {
    name: "Hangar 24",
    city: "Riverside",
    locationCount: 4,
    managerUserId: "u-boss",
  };
  const user = (
    userId: string,
    role: "owner" | "editor" | "media_events",
    createdAt: string,
    email: string,
  ) => ({
    userId,
    role,
    createdAt,
    email,
  });
  const handOffInvite = (): StoredInvite => ({
    id: "i1",
    memberId: MEMBER,
    email: "new@x.com",
    role: "owner",
    expiresAt: "2099-01-01",
    createdAt: "2026-03-01",
    updatedAt: "2026-03-01",
    cancelledAt: null,
  });
  const handedOff = () => [
    user("u-boss", "editor", "2026-01-01", "boss@x.com"),
    user("u-loc", "owner", "2026-02-01", "loc@x.com"),
  ];

  it("labels the business manager and can't remove them", async () => {
    const { store } = memoryStore({
      users: [
        user("u-boss", "owner", "2026-01-01", "boss@x.com"),
        user("u-ed", "media_events", "2026-01-02", "ed@x.com"),
      ],
      business,
    });
    const view = await loadPeople(store, MEMBER, actorFor("u-boss", "owner", true));
    expect(view.people.map((p) => [p.label, p.canRemove])).toEqual([
      ["Business manager · all 4 locations", false],
      ["Photos & events editor · Riverside", true],
    ]);
    expect(view.business).toMatchObject({
      viewerIsManager: true,
      canHandOff: true,
      canTakeBack: false,
    });
  });

  it("after a hand-off: location manager listed after the manager, Take back offered", async () => {
    const { store } = memoryStore({ users: handedOff(), business });
    const view = await loadPeople(store, MEMBER, actorFor("u-boss", "editor", true));
    expect(view.people.map((p) => p.label)).toEqual([
      "Business manager · all 4 locations",
      "Location manager · Riverside",
    ]);
    expect(view.business).toMatchObject({
      locationManagerEmail: "loc@x.com",
      canHandOff: false,
      canTakeBack: true,
    });
  });

  it("the location manager sees no hand-off or take-back", async () => {
    const { store } = memoryStore({ users: handedOff(), business });
    const view = await loadPeople(store, MEMBER, actorFor("u-loc", "owner"));
    expect(view.business).toMatchObject({
      viewerIsManager: false,
      canHandOff: false,
      canTakeBack: false,
    });
  });

  it("a Guild admin editing as them acts as the manager", async () => {
    const { store } = memoryStore({
      users: [user("u-boss", "owner", "2026-01-01", "boss@x.com")],
      business,
    });
    const view = await loadPeople(store, MEMBER, actorFor("u-admin", "owner"), new Date(), {
      viewerIsGuildAdmin: true,
    });
    expect(view.business?.canHandOff).toBe(true);
  });

  it("a pending hand-off hides the hand-off form", async () => {
    const { store } = memoryStore({
      users: [user("u-boss", "owner", "2026-01-01", "boss@x.com")],
      invites: [handOffInvite()],
      business,
    });
    const view = await loadPeople(store, MEMBER, actorFor("u-boss", "owner", true));
    expect(view.business).toMatchObject({ handOffPending: true, canHandOff: false });
    expect(view.invites[0].role).toBe("owner");
  });

  it("removePerson refuses the business manager", async () => {
    const { store } = memoryStore({ users: handedOff(), business });
    await expect(
      removePerson(store, {
        memberId: MEMBER,
        userId: "u-boss",
        actor: actorFor("u-loc", "owner"),
      }),
    ).rejects.toThrow(
      "The business manager can't be removed here. To change who manages Hangar 24, contact the Guild.",
    );
  });

  it("invitePerson refuses an address that has a hand-off waiting", async () => {
    const { store } = memoryStore({
      users: [user("u-boss", "owner", "2026-01-01", "boss@x.com")],
      invites: [handOffInvite()],
      business,
    });
    await expect(
      invitePerson(store, {
        memberId: MEMBER,
        email: "NEW@x.com",
        role: "editor",
        invitedByUserId: "u-boss",
        actor: actorFor("u-boss", "owner", true),
      }),
    ).rejects.toThrow(
      "That address has a hand-off waiting. Cancel it first to invite them as an editor.",
    );
  });
});

describe("co-owners (spec 2026-11-12)", () => {
  const FORBIDDEN = "Only the owner can add or change co-owners.";
  const CO = {
    userId: "u-co",
    role: "co_owner" as const,
    createdAt: "2026-09-02T00:00:00Z",
    email: "co@brewery.com",
  };
  const CO2 = {
    userId: "u-co2",
    role: "co_owner" as const,
    createdAt: "2026-09-03T00:00:00Z",
    email: "co2@brewery.com",
  };
  const AS_CO: PeopleActor = { userId: "u-co", role: "co_owner", isBusinessManager: false };
  const coInvite = (): StoredInvite => ({
    id: "c1",
    memberId: MEMBER,
    email: "pending-co@x.com",
    role: "co_owner",
    expiresAt: "2026-10-01T00:00:00Z",
    createdAt: "2026-09-13T00:00:00Z",
    updatedAt: "2026-09-13T00:00:00Z",
    cancelledAt: null,
  });

  it("the owner invites a co-owner", async () => {
    const { store, invites } = memoryStore({ users: [OWNER] });
    const result = await invitePerson(store, {
      memberId: MEMBER,
      email: "new-co@x.com",
      role: "co_owner",
      invitedByUserId: "u-owner",
      actor: AS_OWNER,
      now: NOW,
    });
    expect(result).toMatchObject({ role: "co_owner", refreshed: false });
    expect(invites[0].role).toBe("co_owner");
  });

  it("a co-owner can't invite a co-owner", async () => {
    const { store, invites } = memoryStore({ users: [OWNER, CO] });
    await expect(
      invitePerson(store, {
        memberId: MEMBER,
        email: "new-co@x.com",
        role: "co_owner",
        invitedByUserId: "u-co",
        actor: AS_CO,
        now: NOW,
      }),
    ).rejects.toThrow(FORBIDDEN);
    expect(invites).toHaveLength(0);
  });

  it("a co-owner can't re-invite an address with a pending co-owner invite", async () => {
    const { store, invites } = memoryStore({ users: [OWNER, CO], invites: [coInvite()] });
    await expect(
      invitePerson(store, {
        memberId: MEMBER,
        email: "pending-co@x.com",
        role: "editor",
        invitedByUserId: "u-co",
        actor: AS_CO,
        now: NOW,
      }),
    ).rejects.toThrow(FORBIDDEN);
    expect(invites[0].role).toBe("co_owner");
  });

  it("a co-owner can't resend or cancel a co-owner invite", async () => {
    const { store, invites } = memoryStore({ users: [OWNER, CO], invites: [coInvite()] });
    await expect(
      resendInvite(store, { memberId: MEMBER, inviteId: "c1", actor: AS_CO, now: NOW }),
    ).rejects.toThrow(FORBIDDEN);
    await expect(
      cancelInvite(store, { memberId: MEMBER, inviteId: "c1", actor: AS_CO, now: NOW }),
    ).rejects.toThrow(FORBIDDEN);
    expect(invites[0]).toMatchObject({ cancelledAt: null, expiresAt: "2026-10-01T00:00:00Z" });
  });

  it("the owner resends and cancels a co-owner invite", async () => {
    const { store, invites } = memoryStore({ users: [OWNER], invites: [coInvite()] });
    await resendInvite(store, { memberId: MEMBER, inviteId: "c1", actor: AS_OWNER, now: NOW });
    await cancelInvite(store, { memberId: MEMBER, inviteId: "c1", actor: AS_OWNER, now: NOW });
    expect(invites[0].cancelledAt).toBe(NOW.toISOString());
  });

  it("a co-owner invites, changes and removes editors and Photos & events editors", async () => {
    const { store, users, invites } = memoryStore({ users: [OWNER, CO, EDITOR, PHOTOS] });
    await invitePerson(store, {
      memberId: MEMBER,
      email: "new-ed@x.com",
      role: "editor",
      invitedByUserId: "u-co",
      actor: AS_CO,
      now: NOW,
    });
    await invitePerson(store, {
      memberId: MEMBER,
      email: "new-photos@x.com",
      role: "media_events",
      invitedByUserId: "u-co",
      actor: AS_CO,
      now: NOW,
    });
    expect(invites.map((i) => i.role)).toEqual(["editor", "media_events"]);
    await expect(
      changeAccess(store, {
        memberId: MEMBER,
        userId: "u-editor",
        role: "media_events",
        actor: AS_CO,
      }),
    ).resolves.toEqual({ fromRole: "editor", toRole: "media_events" });
    await expect(
      changeAccess(store, { memberId: MEMBER, userId: "u-photos", role: "editor", actor: AS_CO }),
    ).resolves.toEqual({ fromRole: "media_events", toRole: "editor" });
    await removePerson(store, { memberId: MEMBER, userId: "u-editor", actor: AS_CO });
    await removePerson(store, { memberId: MEMBER, userId: "u-photos", actor: AS_CO });
    expect(users.map((u) => u.userId)).toEqual(["u-owner", "u-co"]);
  });

  it("the owner removes a co-owner", async () => {
    const { store, users } = memoryStore({ users: [OWNER, CO] });
    await removePerson(store, { memberId: MEMBER, userId: "u-co", actor: AS_OWNER });
    expect(users.map((u) => u.userId)).toEqual(["u-owner"]);
  });

  it("a co-owner can't remove another co-owner", async () => {
    const { store, users } = memoryStore({ users: [OWNER, CO, CO2] });
    await expect(
      removePerson(store, { memberId: MEMBER, userId: "u-co2", actor: AS_CO }),
    ).rejects.toThrow(FORBIDDEN);
    expect(users).toHaveLength(3);
  });

  it("nobody can remove or change the owner", async () => {
    const OWNER_MESSAGE = "The owner can't be removed. To change the owner, contact the Guild.";
    const { store, users } = memoryStore({ users: [OWNER, CO] });
    for (const actor of [AS_OWNER, AS_CO]) {
      await expect(
        removePerson(store, { memberId: MEMBER, userId: "u-owner", actor }),
      ).rejects.toThrow(OWNER_MESSAGE);
      await expect(
        changeAccess(store, { memberId: MEMBER, userId: "u-owner", role: "co_owner", actor }),
      ).rejects.toThrow(OWNER_MESSAGE);
    }
    expect(users.find((u) => u.userId === "u-owner")?.role).toBe("owner");
  });

  describe("changeAccess", () => {
    it("the owner makes a Full editor a co-owner", async () => {
      const { store, users } = memoryStore({ users: [OWNER, EDITOR] });
      const result = await changeAccess(store, {
        memberId: MEMBER,
        userId: "u-editor",
        role: "co_owner",
        actor: AS_OWNER,
      });
      expect(result).toEqual({ fromRole: "editor", toRole: "co_owner" });
      expect(users.find((u) => u.userId === "u-editor")?.role).toBe("co_owner");
    });

    it("refuses a change to the role they already have", async () => {
      const { store } = memoryStore({ users: [OWNER, EDITOR] });
      await expect(
        changeAccess(store, {
          memberId: MEMBER,
          userId: "u-editor",
          role: "editor",
          actor: AS_OWNER,
        }),
      ).rejects.toThrow("They already have that access.");
    });

    it("refuses to change the business manager", async () => {
      const { store, users } = memoryStore({
        users: [
          { ...EDITOR, userId: "u-boss", email: "boss@x.com" },
          { ...OWNER, userId: "u-loc", email: "loc@x.com" },
        ],
        business: {
          name: "Hangar 24",
          city: "Riverside",
          locationCount: 4,
          managerUserId: "u-boss",
        },
      });
      await expect(
        changeAccess(store, {
          memberId: MEMBER,
          userId: "u-boss",
          role: "co_owner",
          actor: actorFor("u-loc", "owner"),
        }),
      ).rejects.toThrow("The business manager's access can't be changed here. Contact the Guild.");
      expect(users[0].role).toBe("editor");
    });

    it("a co-owner can't make a Full editor a co-owner", async () => {
      const { store, users } = memoryStore({ users: [OWNER, CO, EDITOR] });
      await expect(
        changeAccess(store, {
          memberId: MEMBER,
          userId: "u-editor",
          role: "co_owner",
          actor: AS_CO,
        }),
      ).rejects.toThrow(FORBIDDEN);
      expect(users.find((u) => u.userId === "u-editor")?.role).toBe("editor");
    });

    it("a co-owner can't change another co-owner", async () => {
      const { store } = memoryStore({ users: [OWNER, CO, CO2] });
      await expect(
        changeAccess(store, { memberId: MEMBER, userId: "u-co2", role: "editor", actor: AS_CO }),
      ).rejects.toThrow(FORBIDDEN);
    });
  });

  describe("leaveProfile", () => {
    it("a co-owner leaves", async () => {
      const { store, users } = memoryStore({ users: [OWNER, CO] });
      await expect(leaveProfile(store, { memberId: MEMBER, actor: AS_CO })).resolves.toEqual({
        role: "co_owner",
      });
      expect(users.map((u) => u.userId)).toEqual(["u-owner"]);
    });

    it("the owner can't leave", async () => {
      const { store, users } = memoryStore({ users: [OWNER, CO] });
      await expect(leaveProfile(store, { memberId: MEMBER, actor: AS_OWNER })).rejects.toThrow(
        "The owner can't leave the profile. To change the owner, contact the Guild.",
      );
      expect(users).toHaveLength(2);
    });

    it("the business manager can't leave", async () => {
      const { store, users } = memoryStore({
        users: [
          { ...EDITOR, userId: "u-boss", email: "boss@x.com" },
          { ...OWNER, userId: "u-loc", email: "loc@x.com" },
        ],
        business: {
          name: "Hangar 24",
          city: "Riverside",
          locationCount: 4,
          managerUserId: "u-boss",
        },
      });
      await expect(
        leaveProfile(store, { memberId: MEMBER, actor: actorFor("u-boss", "editor", true) }),
      ).rejects.toThrow("The business manager can't leave here. Contact the Guild.");
      expect(users).toHaveLength(2);
    });
  });

  describe("loadPeople", () => {
    it("as a co-owner: invite editors only, leave own row, hands off other co-owners", async () => {
      const { store } = memoryStore({ users: [OWNER, CO, CO2, EDITOR] });
      const view = await loadPeople(store, MEMBER, AS_CO, NOW);
      expect(view.inviteRoles).toEqual(["editor", "media_events"]);
      const row = (userId: string) => view.people.find((p) => p.userId === userId);
      expect(row("u-co")).toMatchObject({ isYou: true, canLeave: true, canRemove: false });
      expect(row("u-co2")).toMatchObject({
        canRemove: false,
        canChangeAccess: false,
        canLeave: false,
        accessOptions: [],
      });
      expect(row("u-editor")).toMatchObject({
        canRemove: true,
        canChangeAccess: true,
        accessOptions: ["media_events"],
      });
      expect(row("u-owner")).toMatchObject({ canRemove: false, canChangeAccess: false });
    });

    it("as the owner: co-owners can be removed and changed, all three roles to invite", async () => {
      const { store } = memoryStore({ users: [OWNER, CO, EDITOR] });
      const view = await loadPeople(store, MEMBER, AS_OWNER, NOW);
      expect(view.inviteRoles).toEqual(["co_owner", "editor", "media_events"]);
      expect(view.people.map((p) => p.userId)).toEqual(["u-owner", "u-co", "u-editor"]);
      expect(view.people[0]).toMatchObject({ canLeave: false, canChangeAccess: false });
      expect(view.people[1]).toMatchObject({
        label: "Co-owner",
        canRemove: true,
        canChangeAccess: true,
        accessOptions: ["editor", "media_events"],
      });
      expect(view.people[2].accessOptions).toEqual(["co_owner", "media_events"]);
    });

    it("labels a co-owner in a one-manager business", async () => {
      const { store } = memoryStore({
        users: [OWNER, CO],
        business: { name: "Hangar 24", city: "Riverside", locationCount: 4, managerUserId: null },
      });
      const view = await loadPeople(store, MEMBER, AS_OWNER, NOW);
      expect(view.people[1].label).toBe("Co-owner · Riverside");
    });
  });
});

describe("peopleBusinessCopy (BZ4)", () => {
  const business = {
    name: "Hangar 24",
    city: "Riverside",
    locationCount: 4,
    viewerIsManager: true,
    locationManagerEmail: "loc@x.com",
    handOffPending: false,
    canHandOff: false,
    canTakeBack: true,
  };

  it("words the hand-off help, handed-off card and take-back dialog", () => {
    expect(peopleBusinessCopy(business)).toEqual({
      handOffHelp:
        "They'll manage Riverside only. You keep access, and the logo, cover and theme stay shared.",
      handedOffTitle: "Riverside is handed off",
      handedOffBody: "loc@x.com manages Riverside. You still have access.",
      takeBackTitle: "Take back Riverside?",
      takeBackBody:
        "loc@x.com will no longer be able to edit Riverside, and you'll manage it again.",
    });
  });

  it("falls back to 'They' before anyone manages the location", () => {
    expect(peopleBusinessCopy({ ...business, locationManagerEmail: null }).handedOffBody).toBe(
      "They manage Riverside. You still have access.",
    );
  });
});

describe("access that changed since it was read", () => {
  const RACE = "That person's access just changed. Refresh and try again.";
  const CO = {
    userId: "u-co",
    role: "co_owner" as const,
    createdAt: "2026-09-02T00:00:00Z",
    email: "co@brewery.com",
  };
  // A store whose reads still show `stale` while the database already holds `users`.
  function staleStore(
    stale: MemberUserRecord[],
    users: Parameters<typeof memoryStore>[0]["users"],
  ) {
    const memory = memoryStore({ users });
    const store: PeopleStore = { ...memory.store, listMemberUsers: async () => stale };
    return { store, users: memory.users };
  }
  const asRecord = ({ userId, role, createdAt }: MemberUserRecord) => ({ userId, role, createdAt });

  it("removePerson writes nothing when the person was just made a co-owner", async () => {
    // A co-owner read them as a Full editor; the owner promoted them a moment ago.
    const { store, users } = staleStore(
      [asRecord(OWNER), asRecord(CO), asRecord(EDITOR)],
      [OWNER, CO, { ...EDITOR, role: "co_owner" }],
    );
    await expect(
      removePerson(store, {
        memberId: MEMBER,
        userId: "u-editor",
        actor: { userId: "u-co", role: "co_owner", isBusinessManager: false },
      }),
    ).rejects.toThrow(RACE);
    expect(users.find((u) => u.userId === "u-editor")?.role).toBe("co_owner");
  });

  it("changeAccess writes nothing when the person was just made a co-owner", async () => {
    const { store, users } = staleStore(
      [asRecord(OWNER), asRecord(CO), asRecord(EDITOR)],
      [OWNER, CO, { ...EDITOR, role: "co_owner" }],
    );
    await expect(
      changeAccess(store, {
        memberId: MEMBER,
        userId: "u-editor",
        role: "media_events",
        actor: { userId: "u-co", role: "co_owner", isBusinessManager: false },
      }),
    ).rejects.toThrow(RACE);
    expect(users.find((u) => u.userId === "u-editor")?.role).toBe("co_owner");
  });

  it("leaveProfile writes nothing when their access just changed", async () => {
    const { store, users } = staleStore(
      [asRecord(OWNER), asRecord(CO)],
      [OWNER, { ...CO, role: "editor" }],
    );
    await expect(
      leaveProfile(store, {
        memberId: MEMBER,
        actor: { userId: "u-co", role: "co_owner", isBusinessManager: false },
      }),
    ).rejects.toThrow(RACE);
    expect(users).toHaveLength(2);
  });

  it("removePerson reports the role it removed", async () => {
    const { store } = memoryStore({ users: [OWNER, EDITOR] });
    await expect(
      removePerson(store, { memberId: MEMBER, userId: "u-editor", actor: AS_OWNER }),
    ).resolves.toEqual({ role: "editor" });
  });
});

describe("a pending hand-off (open invite with role owner)", () => {
  const HAND_OFF_FORBIDDEN = "Only the owner or the business manager can change a hand-off.";
  const handOff = (): StoredInvite => ({
    id: "h1",
    memberId: MEMBER,
    email: "new@x.com",
    role: "owner",
    expiresAt: "2026-10-01T00:00:00Z",
    createdAt: "2026-09-13T00:00:00Z",
    updatedAt: "2026-09-13T00:00:00Z",
    cancelledAt: null,
  });

  it("a co-owner can't resend or cancel it", async () => {
    const { store, invites } = memoryStore({ users: [OWNER], invites: [handOff()] });
    const asCo = actorFor("u-co", "co_owner");
    await expect(
      resendInvite(store, { memberId: MEMBER, inviteId: "h1", actor: asCo, now: NOW }),
    ).rejects.toThrow(HAND_OFF_FORBIDDEN);
    await expect(
      cancelInvite(store, { memberId: MEMBER, inviteId: "h1", actor: asCo, now: NOW }),
    ).rejects.toThrow(HAND_OFF_FORBIDDEN);
    expect(invites[0]).toMatchObject({ cancelledAt: null, expiresAt: "2026-10-01T00:00:00Z" });
  });

  it("the owner resends it and the business manager cancels it", async () => {
    const { store, invites } = memoryStore({ users: [OWNER], invites: [handOff()] });
    await expect(
      resendInvite(store, { memberId: MEMBER, inviteId: "h1", actor: AS_OWNER, now: NOW }),
    ).resolves.toEqual({ email: "new@x.com", role: "owner" });
    await expect(
      cancelInvite(store, {
        memberId: MEMBER,
        inviteId: "h1",
        actor: actorFor("u-boss", "editor", true),
        now: NOW,
      }),
    ).resolves.toEqual({ email: "new@x.com", role: "owner" });
    expect(invites[0].cancelledAt).toBe(NOW.toISOString());
  });

  it("loadPeople offers Resend and Cancel invite only to whoever may use them", async () => {
    const coInvite: StoredInvite = { ...handOff(), id: "c1", email: "co@x.com", role: "co_owner" };
    const edInvite: StoredInvite = { ...handOff(), id: "e1", email: "ed@x.com", role: "editor" };
    const { store } = memoryStore({ users: [OWNER], invites: [handOff(), coInvite, edInvite] });
    const manage = async (actor: PeopleActor) =>
      Object.fromEntries(
        (await loadPeople(store, MEMBER, actor, NOW)).invites.map((i) => [i.id, i.canManage]),
      );
    expect(await manage(AS_OWNER)).toEqual({ h1: true, c1: true, e1: true });
    expect(await manage(actorFor("u-co", "co_owner"))).toEqual({ h1: false, c1: false, e1: true });
    expect(await manage(actorFor("u-boss", "editor", true))).toEqual({
      h1: true,
      c1: false,
      e1: true,
    });
  });
});
