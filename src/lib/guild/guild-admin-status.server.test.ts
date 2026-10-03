import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkGuildAdminStatus, hasSupabaseAuthCookie } from "./guild-admin-status.server";

function fakeSupabase(opts: {
  user: { id: string } | null;
  profile: { is_guild_admin: boolean } | null;
  memberUser: { member_id: string } | null;
}): SupabaseClient {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user }, error: null }),
    },
    from(table: string) {
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.profile, error: null }) }) }) };
      }
      if (table === "member_users") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({ maybeSingle: async () => ({ data: opts.memberUser, error: null }) }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

describe("hasSupabaseAuthCookie", () => {
  it("is false with no cookies at all", () => {
    expect(hasSupabaseAuthCookie([])).toBe(false);
  });

  it("is false with unrelated cookies", () => {
    expect(hasSupabaseAuthCookie(["theme", "cookie-consent"])).toBe(false);
  });

  it("is true for a real Supabase auth cookie", () => {
    expect(hasSupabaseAuthCookie(["sb-fcpdckxznzafzketfvit-auth-token"])).toBe(true);
  });

  it("is true for a chunked Supabase auth cookie", () => {
    expect(hasSupabaseAuthCookie(["sb-fcpdckxznzafzketfvit-auth-token.0", "sb-fcpdckxznzafzketfvit-auth-token.1"])).toBe(
      true,
    );
  });
});

describe("checkGuildAdminStatus", () => {
  it("skips the Supabase call entirely when there's no auth cookie", async () => {
    let called = false;
    const result = await checkGuildAdminStatus([], async () => {
      called = true;
      return fakeSupabase({ user: null, profile: null, memberUser: null });
    });
    expect(result).toEqual({ isGuildAdmin: false });
    expect(called).toBe(false);
  });

  it("is false when the cookie exists but getUser finds no user", async () => {
    const result = await checkGuildAdminStatus(["sb-x-auth-token"], async () =>
      fakeSupabase({ user: null, profile: null, memberUser: null }),
    );
    expect(result).toEqual({ isGuildAdmin: false });
  });

  it("is true for a signed-in guild admin", async () => {
    const result = await checkGuildAdminStatus(["sb-x-auth-token"], async () =>
      fakeSupabase({ user: { id: "u1" }, profile: { is_guild_admin: true }, memberUser: null }),
    );
    expect(result).toEqual({ isGuildAdmin: true });
  });

  it("is false for a signed-in member editor (not a guild admin)", async () => {
    const result = await checkGuildAdminStatus(["sb-x-auth-token"], async () =>
      fakeSupabase({ user: { id: "u1" }, profile: null, memberUser: { member_id: "m1" } }),
    );
    expect(result).toEqual({ isGuildAdmin: false });
  });

  it("is false for a signed-in user with neither role", async () => {
    const result = await checkGuildAdminStatus(["sb-x-auth-token"], async () =>
      fakeSupabase({ user: { id: "u1" }, profile: null, memberUser: null }),
    );
    expect(result).toEqual({ isGuildAdmin: false });
  });
});
