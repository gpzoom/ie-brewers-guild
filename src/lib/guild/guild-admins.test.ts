import { describe, expect, it } from "vitest";
import {
  acceptGuildAdminInvites,
  cancelGuildAdminInvite,
  inviteGuildAdmin,
  loadGuildAdmins,
  removeGuildAdmin,
  resendGuildAdminInvite,
  type GuildAdminAudit,
  type GuildAdminInviteRecord,
  type GuildAdminStore,
} from "@/lib/guild/guild-admins";

const NOW = new Date("2026-09-27T12:00:00Z");

type Person = { userId: string; email: string; guildAdmin: boolean; superAdmin: boolean };
type Invite = GuildAdminInviteRecord & { cancelled: boolean; accepted: boolean };

function memoryStore(seed: { people?: Person[]; invites?: Invite[] }) {
  const people = [...(seed.people ?? [])];
  const invites = [...(seed.invites ?? [])];
  const audits: GuildAdminAudit[] = [];
  let next = 1;
  const store: GuildAdminStore = {
    async listAdmins() {
      return people
        .filter((p) => p.guildAdmin || p.superAdmin)
        .map((p) => ({ userId: p.userId, isSuperAdmin: p.superAdmin, addedAt: "2026-09-01T00:00:00Z" }));
    },
    async account(userId) {
      return { email: people.find((p) => p.userId === userId)?.email ?? null, lastSignInAt: null };
    },
    async findUserIdByEmail(email) {
      return people.find((p) => p.email === email)?.userId ?? null;
    },
    async isGuildAdmin(userId) {
      const p = people.find((x) => x.userId === userId);
      return { isGuildAdmin: !!p && (p.guildAdmin || p.superAdmin), isSuperAdmin: !!p?.superAdmin };
    },
    async setGuildAdmin(userId, value) {
      const p = people.find((x) => x.userId === userId);
      if (p) p.guildAdmin = value;
      else people.push({ userId, email: "?", guildAdmin: value, superAdmin: false });
    },
    async listOpenInvites() {
      return invites.filter((i) => !i.cancelled && !i.accepted);
    },
    async insertInvite(row) {
      const invite: Invite = {
        id: `inv-${next++}`,
        email: row.email,
        expiresAt: row.expiresAt,
        updatedAt: NOW.toISOString(),
        invitedByUserId: row.invitedByUserId,
        cancelled: false,
        accepted: false,
      };
      invites.push(invite);
      return invite;
    },
    async updateInvite(id, patch) {
      const invite = invites.find((i) => i.id === id)!;
      if (patch.expiresAt) invite.expiresAt = patch.expiresAt;
      if (patch.cancelledAt) invite.cancelled = true;
      if (patch.acceptedAt) invite.accepted = true;
      invite.updatedAt = NOW.toISOString();
    },
    async audit(entry) {
      audits.push(entry);
    },
  };
  return { store, people, invites, audits };
}

const SUPER: Person = { userId: "u-super", email: "boblelle77+sa@gmail.com", guildAdmin: true, superAdmin: true };
const ADMIN: Person = { userId: "u-admin", email: "boblelle77@gmail.com", guildAdmin: true, superAdmin: false };
const OLD_INVITE = (): Invite => ({
  id: "inv-old",
  email: "sam@example.com",
  expiresAt: "2026-09-20T00:00:00Z",
  updatedAt: "2026-09-06T00:00:00Z",
  invitedByUserId: "u-super",
  cancelled: false,
  accepted: false,
});

describe("loadGuildAdmins", () => {
  it("lists the super admin first, marks who's viewing, and never offers to remove the super admin", async () => {
    const { store } = memoryStore({ people: [ADMIN, SUPER], invites: [OLD_INVITE()] });
    const view = await loadGuildAdmins(store, "u-super", NOW);
    expect(view.admins.map((a) => a.userId)).toEqual(["u-super", "u-admin"]);
    expect(view.admins[0]).toMatchObject({ isYou: true, canRemove: false, isSuperAdmin: true });
    expect(view.admins[1]).toMatchObject({ canRemove: true, email: "boblelle77@gmail.com" });
    expect(view.invites[0]).toMatchObject({ email: "sam@example.com", expired: true });
  });
});

describe("inviteGuildAdmin", () => {
  it("creates an invite (lowercased) and audits it", async () => {
    const { store, invites, audits } = memoryStore({ people: [SUPER] });
    const result = await inviteGuildAdmin(store, { email: " New@Example.com ", actorUserId: "u-super", now: NOW });
    expect(result).toMatchObject({ email: "new@example.com", refreshed: false });
    expect(invites[0].expiresAt).toBe("2026-10-11T12:00:00.000Z");
    expect(audits[0]).toMatchObject({ tableName: "guild_admin_invites", action: "insert", details: { email: "new@example.com" } });
  });

  it("refuses someone who's already a Guild admin", async () => {
    const { store } = memoryStore({ people: [SUPER, ADMIN] });
    await expect(
      inviteGuildAdmin(store, { email: "boblelle77@gmail.com", actorUserId: "u-super", now: NOW }),
    ).rejects.toThrow("already a Guild admin");
  });

  it("refreshes an open invite instead of adding another, but not within a few minutes", async () => {
    const { store, invites } = memoryStore({ invites: [OLD_INVITE()] });
    const result = await inviteGuildAdmin(store, { email: "sam@example.com", actorUserId: "u-super", now: NOW });
    expect(result).toMatchObject({ inviteId: "inv-old", refreshed: true });
    expect(invites).toHaveLength(1);
    await expect(
      inviteGuildAdmin(store, { email: "sam@example.com", actorUserId: "u-super", now: NOW }),
    ).rejects.toThrow("send it again in a few minutes");
  });
});

describe("resend and cancel", () => {
  it("resend restarts the 14 days", async () => {
    const { store, invites } = memoryStore({ invites: [OLD_INVITE()] });
    await resendGuildAdminInvite(store, { inviteId: "inv-old", actorUserId: "u-super", now: NOW });
    expect(invites[0].expiresAt).toBe("2026-10-11T12:00:00.000Z");
  });

  it("cancel closes the invite and audits it", async () => {
    const { store, invites, audits } = memoryStore({ invites: [OLD_INVITE()] });
    await cancelGuildAdminInvite(store, { inviteId: "inv-old", actorUserId: "u-super", now: NOW });
    expect(invites[0].cancelled).toBe(true);
    expect(audits[0].details.change).toBe("invite canceled");
  });

  it("refuses an invite that isn't pending", async () => {
    const { store } = memoryStore({});
    await expect(
      cancelGuildAdminInvite(store, { inviteId: "nope", actorUserId: "u-super" }),
    ).rejects.toThrow("isn't pending");
  });
});

describe("removeGuildAdmin", () => {
  it("turns a Guild admin's access off and audits it with their address", async () => {
    const { store, people, audits } = memoryStore({ people: [SUPER, ADMIN] });
    await removeGuildAdmin(store, { userId: "u-admin", actorUserId: "u-super" });
    expect(people.find((p) => p.userId === "u-admin")!.guildAdmin).toBe(false);
    expect(audits[0]).toMatchObject({
      tableName: "profiles",
      rowId: "u-admin",
      details: { email: "boblelle77@gmail.com", change: "Guild admin access removed" },
    });
  });

  it("never removes the super admin", async () => {
    const { store, people } = memoryStore({ people: [SUPER] });
    await expect(removeGuildAdmin(store, { userId: "u-super", actorUserId: "u-super" })).rejects.toThrow(
      "super admin's access can't be removed",
    );
    expect(people[0].guildAdmin).toBe(true);
  });
});

describe("acceptGuildAdminInvites (at sign-in)", () => {
  it("grants access for an open invite to the signed-in address, audited against the inviter", async () => {
    const invite = { ...OLD_INVITE(), expiresAt: "2026-10-01T00:00:00Z" };
    const { store, people, invites, audits } = memoryStore({ invites: [invite] });
    const result = await acceptGuildAdminInvites(store, { id: "u-sam", email: "Sam@Example.com" }, NOW);
    expect(result.granted).toBe(true);
    expect(people.find((p) => p.userId === "u-sam")!.guildAdmin).toBe(true);
    expect(invites[0].accepted).toBe(true);
    expect(audits[0]).toMatchObject({ actorUserId: "u-super", rowId: "u-sam" });
  });

  it("ignores an expired invite", async () => {
    const { store, people } = memoryStore({ invites: [OLD_INVITE()] });
    const result = await acceptGuildAdminInvites(store, { id: "u-sam", email: "sam@example.com" }, NOW);
    expect(result.granted).toBe(false);
    expect(people).toHaveLength(0);
  });

  it("ignores someone with no invite", async () => {
    const { store } = memoryStore({});
    expect((await acceptGuildAdminInvites(store, { id: "u-x", email: "x@example.com" }, NOW)).granted).toBe(false);
  });
});
