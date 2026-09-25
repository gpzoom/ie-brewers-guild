import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { acceptPendingInvites, listPortalMemberships, pickMembership, type PortalMembership } from "./portal-access";

type Invite = {
  id: string;
  member_id: string;
  role: string;
  email: string;
  expires_at: string;
  accepted_at: string | null;
  cancelled_at: string | null;
  accepted_user_id?: string | null;
};

const NOW = new Date("2026-09-25T12:00:00Z");
const FUTURE = "2026-10-05T12:00:00Z";
const PAST = "2026-09-20T12:00:00Z";

/**
 * A tiny in-memory stand-in for the service-role client: member_invites
 * honors the filters acceptPendingInvites uses (ilike without wildcards is
 * a case-insensitive equality here, which is how it must behave after
 * escaping); member_users enforces unique (member_id, user_id).
 */
function fakeClient(opts: {
  invites: Invite[];
  memberUsers?: Array<{ member_id: string; user_id: string; role: string }>;
  insertErrorCode?: string;
  ilikeOverride?: (email: string) => boolean;
}) {
  const memberUsers = opts.memberUsers ?? [];
  const ilikeFilters: string[] = [];

  const client = {
    from(table: string) {
      if (table === "member_invites") {
        return {
          select: () => {
            const filters: Array<(row: Invite) => boolean> = [];
            const q = {
              ilike(_col: string, pattern: string) {
                ilikeFilters.push(pattern);
                const literal = pattern.replace(/\\(.)/g, "$1").toLowerCase();
                filters.push((row) =>
                  opts.ilikeOverride ? opts.ilikeOverride(row.email) : row.email.toLowerCase() === literal,
                );
                return q;
              },
              is(col: "accepted_at" | "cancelled_at", _v: null) {
                filters.push((row) => row[col] === null);
                return q;
              },
              gt(_col: string, iso: string) {
                filters.push((row) => row.expires_at > iso);
                return Promise.resolve({ data: opts.invites.filter((r) => filters.every((f) => f(r))), error: null });
              },
            };
            return q;
          },
          update(values: Partial<Invite>) {
            return {
              eq: (_col: string, id: string) => ({
                is: async () => {
                  const row = opts.invites.find((r) => r.id === id && r.accepted_at === null);
                  if (row) Object.assign(row, values);
                  return { error: null };
                },
              }),
            };
          },
        };
      }
      if (table === "member_users") {
        return {
          insert: async (row: { member_id: string; user_id: string; role: string }) => {
            if (opts.insertErrorCode) return { error: { code: opts.insertErrorCode, message: "boom" } };
            if (memberUsers.some((m) => m.member_id === row.member_id && m.user_id === row.user_id)) {
              return { error: { code: "23505", message: "duplicate" } };
            }
            memberUsers.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;

  return { client, memberUsers, ilikeFilters };
}

function invite(partial: Partial<Invite> & Pick<Invite, "id" | "email">): Invite {
  return {
    member_id: "m1",
    role: "editor",
    expires_at: FUTURE,
    accepted_at: null,
    cancelled_at: null,
    ...partial,
  };
}

describe("acceptPendingInvites", () => {
  it("accepts a pending invite for the user's address (any case) and links them with the invited role", async () => {
    const invites = [invite({ id: "i1", email: "Pat@Example.com", role: "media_events" })];
    const { client, memberUsers } = fakeClient({ invites });

    const result = await acceptPendingInvites(client, { id: "u1", email: "pat@example.COM" }, NOW);

    expect(result.accepted).toEqual([{ memberId: "m1", role: "media_events" }]);
    expect(memberUsers).toEqual([{ member_id: "m1", user_id: "u1", role: "media_events" }]);
    expect(invites[0].accepted_at).toBe(NOW.toISOString());
    expect(invites[0].accepted_user_id).toBe("u1");
  });

  it("never accepts an invite for a different address, even if the database filter over-matches", async () => {
    const invites = [invite({ id: "i1", email: "someone-else@example.com" })];
    const { client, memberUsers } = fakeClient({ invites, ilikeOverride: () => true });

    const result = await acceptPendingInvites(client, { id: "u1", email: "pat@example.com" }, NOW);

    expect(result.accepted).toEqual([]);
    expect(memberUsers).toEqual([]);
    expect(invites[0].accepted_at).toBeNull();
  });

  it("escapes LIKE wildcards in the address", async () => {
    const { client, ilikeFilters } = fakeClient({ invites: [] });
    await acceptPendingInvites(client, { id: "u1", email: "a_b%c@example.com" }, NOW);
    expect(ilikeFilters).toEqual(["a\\_b\\%c@example.com"]);
  });

  it("skips expired, cancelled and already-accepted invites", async () => {
    const invites = [
      invite({ id: "expired", email: "pat@example.com", expires_at: PAST }),
      invite({ id: "cancelled", email: "pat@example.com", member_id: "m2", cancelled_at: PAST }),
      invite({ id: "accepted", email: "pat@example.com", member_id: "m3", accepted_at: PAST }),
    ];
    const { client, memberUsers } = fakeClient({ invites });

    const result = await acceptPendingInvites(client, { id: "u1", email: "pat@example.com" }, NOW);

    expect(result.accepted).toEqual([]);
    expect(memberUsers).toEqual([]);
  });

  it("marks the invite accepted but keeps the existing link and role when already linked (23505)", async () => {
    const invites = [invite({ id: "i1", email: "pat@example.com", role: "media_events" })];
    const { client, memberUsers } = fakeClient({
      invites,
      memberUsers: [{ member_id: "m1", user_id: "u1", role: "owner" }],
    });

    const result = await acceptPendingInvites(client, { id: "u1", email: "pat@example.com" }, NOW);

    expect(result.accepted).toEqual([{ memberId: "m1", role: "media_events" }]);
    expect(memberUsers).toEqual([{ member_id: "m1", user_id: "u1", role: "owner" }]);
    expect(invites[0].accepted_at).toBe(NOW.toISOString());
  });

  it("leaves the invite pending when linking fails for any other reason", async () => {
    const invites = [invite({ id: "i1", email: "pat@example.com" })];
    const { client } = fakeClient({ invites, insertErrorCode: "42501" });

    const result = await acceptPendingInvites(client, { id: "u1", email: "pat@example.com" }, NOW);

    expect(result.accepted).toEqual([]);
    expect(invites[0].accepted_at).toBeNull();
  });

  it("accepts invites to several members at once", async () => {
    const invites = [
      invite({ id: "i1", email: "pat@example.com", member_id: "m1" }),
      invite({ id: "i2", email: "pat@example.com", member_id: "m2", role: "media_events" }),
    ];
    const { client, memberUsers } = fakeClient({ invites });

    const result = await acceptPendingInvites(client, { id: "u1", email: "pat@example.com" }, NOW);

    expect(result.accepted).toHaveLength(2);
    expect(memberUsers.map((m) => m.member_id)).toEqual(["m1", "m2"]);
  });

  it("does nothing for a user without an email", async () => {
    const { client } = fakeClient({ invites: [invite({ id: "i1", email: "pat@example.com" })] });
    expect(await acceptPendingInvites(client, { id: "u1", email: null }, NOW)).toEqual({ accepted: [] });
    expect(await acceptPendingInvites(client, { id: "u1", email: "  " }, NOW)).toEqual({ accepted: [] });
  });
});

describe("listPortalMemberships", () => {
  function listClient(rows: unknown[], calls: string[] = []) {
    return {
      from(table: string) {
        if (table !== "member_users") throw new Error(`unexpected table ${table}`);
        return {
          select: () => ({
            eq: (_col: string, userId: string) => {
              calls.push(userId);
              return { order: async () => ({ data: rows, error: null }) };
            },
          }),
        };
      },
    } as unknown as SupabaseClient;
  }

  it("maps rows, keeps order, and drops unknown roles or missing members", async () => {
    const calls: string[] = [];
    const client = listClient(
      [
        {
          member_id: "m1",
          role: "owner",
          members: { business_name: "Alpha Brewing", type_confirmed_at: "t", setup_completed_at: null },
        },
        { member_id: "m2", role: "superuser", members: { business_name: "X" } },
        { member_id: "m3", role: "editor", members: null },
        {
          member_id: "m4",
          role: "media_events",
          members: { business_name: "  ", type_confirmed_at: null, setup_completed_at: null },
        },
      ],
      calls,
    );

    expect(await listPortalMemberships(client, "u1")).toEqual([
      { memberId: "m1", role: "owner", businessName: "Alpha Brewing", typeConfirmedAt: "t", setupCompletedAt: null },
      {
        memberId: "m4",
        role: "media_events",
        businessName: "Unnamed business",
        typeConfirmedAt: null,
        setupCompletedAt: null,
      },
    ]);
    expect(calls).toEqual(["u1"]);
  });
});

describe("pickMembership", () => {
  const m = (id: string): PortalMembership => ({
    memberId: id,
    role: "owner",
    businessName: id,
    typeConfirmedAt: null,
    setupCompletedAt: null,
  });

  it("none when there are no memberships", () => {
    expect(pickMembership([], "m1")).toEqual({ kind: "none" });
  });

  it("the only membership, whatever the cookie says, even when switching", () => {
    expect(pickMembership([m("m1")], "other", true)).toEqual({ kind: "one", membership: m("m1") });
  });

  it("the chooser when there are several and no choice", () => {
    expect(pickMembership([m("m1"), m("m2")], null)).toEqual({ kind: "choose", memberships: [m("m1"), m("m2")] });
  });

  it("the remembered choice when it is one of the user's memberships", () => {
    expect(pickMembership([m("m1"), m("m2")], "m2")).toEqual({ kind: "one", membership: m("m2") });
  });

  it("ignores a remembered choice the user isn't linked to", () => {
    expect(pickMembership([m("m1"), m("m2")], "m9").kind).toBe("choose");
  });

  it("shows the chooser when switching, even with a valid choice", () => {
    expect(pickMembership([m("m1"), m("m2")], "m2", true).kind).toBe("choose");
  });
});
