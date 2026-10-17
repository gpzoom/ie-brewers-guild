import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { changeMemberEmail, fetchMemberEmail } from "./member-email.server";
import type { ImpersonationState } from "@/lib/guild/impersonation-token";

/** The signed-in person is the super admin unless `isSuperAdmin` is false (an ordinary Guild admin). */
function fakeSessionClient(
  memberUser: { user_id: string } | null,
  isSuperAdmin = true,
  rows?: Array<{ user_id: string; role: string }>,
): SupabaseClient {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "actor-1" } }, error: null }) },
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { is_guild_admin: true, is_super_admin: isSuperAdmin },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table !== "member_users") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({
              data: rows ?? (memberUser ? [{ ...memberUser, role: "owner" }] : []),
              error: null,
            }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
}

function fakeServiceClient(opts: {
  userEmail?: string | null;
  emailsByUser?: Record<string, string>;
  updateError?: { message: string } | null;
  updateUserByIdCalls?: Array<{ userId: string; attrs: Record<string, unknown> }>;
}): SupabaseClient {
  return {
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: {
            user: opts.emailsByUser ? { email: opts.emailsByUser[id] } : opts.userEmail ? { email: opts.userEmail } : null,
          },
          error: null,
        }),
        updateUserById: async (userId: string, attrs: Record<string, unknown>) => {
          opts.updateUserByIdCalls?.push({ userId, attrs });
          return { error: opts.updateError ?? null };
        },
      },
    },
  } as unknown as SupabaseClient;
}

function impersonating(memberId: string): ImpersonationState {
  return { actorUserId: "actor-1", memberId, startedAt: 0, lastActivityAt: 0 };
}

describe("fetchMemberEmail", () => {
  it("returns the email of the first member_users row's user", async () => {
    const result = await fetchMemberEmail(
      "member-1",
      fakeSessionClient({ user_id: "user-1" }),
      fakeServiceClient({ userEmail: "owner@example.com" }),
    );
    expect(result).toEqual({ email: "owner@example.com" });
  });

  it("returns the owner's email even when an older editor row exists", async () => {
    const result = await fetchMemberEmail(
      "member-1",
      fakeSessionClient(null, true, [
        { user_id: "manager", role: "editor" },
        { user_id: "owner", role: "owner" },
      ]),
      fakeServiceClient({ emailsByUser: { manager: "manager@example.com", owner: "owner@example.com" } }),
    );
    expect(result).toEqual({ email: "owner@example.com" });
  });

  it("with no owner row, returns the earliest row's email", async () => {
    const result = await fetchMemberEmail(
      "member-1",
      fakeSessionClient(null, true, [
        { user_id: "first", role: "editor" },
        { user_id: "second", role: "editor" },
      ]),
      fakeServiceClient({ emailsByUser: { first: "first@example.com", second: "second@example.com" } }),
    );
    expect(result).toEqual({ email: "first@example.com" });
  });

  it("returns null for an unclaimed member (no member_users row)", async () => {
    const result = await fetchMemberEmail(
      "member-1",
      fakeSessionClient(null),
      fakeServiceClient({ userEmail: "owner@example.com" }),
    );
    expect(result).toEqual({ email: null });
  });

  it("returns null when the user_id can't be resolved to a real user", async () => {
    const result = await fetchMemberEmail(
      "member-1",
      fakeSessionClient({ user_id: "user-1" }),
      fakeServiceClient({ userEmail: null }),
    );
    expect(result).toEqual({ email: null });
  });
});

describe("changeMemberEmail", () => {
  it("rejects when there is no active impersonation session at all", async () => {
    await expect(
      changeMemberEmail(
        "member-1",
        "new@example.com",
        null,
        fakeSessionClient({ user_id: "user-1" }),
        fakeServiceClient({}),
      ),
    ).rejects.toThrow("only available while editing as them");
  });

  it("rejects a Guild admin who isn't the super admin, even while editing as that member", async () => {
    const calls: Array<{ userId: string; attrs: Record<string, unknown> }> = [];
    await expect(
      changeMemberEmail(
        "member-1",
        "new@example.com",
        impersonating("member-1"),
        fakeSessionClient({ user_id: "user-1" }, false),
        fakeServiceClient({ updateUserByIdCalls: calls }),
      ),
    ).rejects.toThrow("Only the super admin can change a member's sign-in email.");
    expect(calls).toHaveLength(0);
  });

  it("rejects when impersonating a DIFFERENT member than the one being updated", async () => {
    await expect(
      changeMemberEmail(
        "member-1",
        "new@example.com",
        impersonating("member-2"),
        fakeSessionClient({ user_id: "user-1" }),
        fakeServiceClient({}),
      ),
    ).rejects.toThrow("only available while editing as them");
  });

  it("rejects a malformed email before touching the member_users lookup at all", async () => {
    const calls: Array<{ userId: string; attrs: Record<string, unknown> }> = [];
    await expect(
      changeMemberEmail(
        "member-1",
        "not-an-email",
        impersonating("member-1"),
        fakeSessionClient({ user_id: "user-1" }),
        fakeServiceClient({ updateUserByIdCalls: calls }),
      ),
    ).rejects.toThrow("Enter a valid email address.");
    expect(calls).toHaveLength(0);
  });

  it("rejects an unclaimed member (no member_users row) with a clear message", async () => {
    await expect(
      changeMemberEmail("member-1", "new@example.com", impersonating("member-1"), fakeSessionClient(null), fakeServiceClient({})),
    ).rejects.toThrow("hasn't been claimed yet");
  });

  it("updates the correct user's email with email_confirm: true, while actively impersonating that exact member", async () => {
    const calls: Array<{ userId: string; attrs: Record<string, unknown> }> = [];
    const result = await changeMemberEmail(
      "member-1",
      "new@example.com",
      impersonating("member-1"),
      fakeSessionClient({ user_id: "user-1" }),
      fakeServiceClient({ updateUserByIdCalls: calls }),
    );
    expect(result).toEqual({ ok: true, userId: "user-1" });
    expect(calls).toEqual([{ userId: "user-1", attrs: { email: "new@example.com", email_confirm: true } }]);
  });

  it("trims whitespace from the submitted email before validating and saving", async () => {
    const calls: Array<{ userId: string; attrs: Record<string, unknown> }> = [];
    await changeMemberEmail(
      "member-1",
      "  new@example.com  ",
      impersonating("member-1"),
      fakeSessionClient({ user_id: "user-1" }),
      fakeServiceClient({ updateUserByIdCalls: calls }),
    );
    expect(calls[0].attrs.email).toBe("new@example.com");
  });

  it("surfaces a Supabase error instead of silently succeeding", async () => {
    await expect(
      changeMemberEmail(
        "member-1",
        "new@example.com",
        impersonating("member-1"),
        fakeSessionClient({ user_id: "user-1" }),
        fakeServiceClient({ updateError: { message: "email address already in use" } }),
      ),
    ).rejects.toThrow("email address already in use");
  });
});
