import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCallbackRedirect, resolveUserRoleAndTarget } from "./role-routing";

function fakeSupabase(responses: {
  profile: { is_guild_admin: boolean } | null;
  memberUser: { member_id: string } | null;
}): SupabaseClient {
  return {
    from(table: string) {
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: responses.profile, error: null }) }) }) };
      }
      if (table === "member_users") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({ maybeSingle: async () => ({ data: responses.memberUser, error: null }) }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

describe("resolveUserRoleAndTarget", () => {
  it("routes a guild admin to /guild, even if they also have a member_users row", async () => {
    const supabase = fakeSupabase({ profile: { is_guild_admin: true }, memberUser: { member_id: "m1" } });
    expect(await resolveUserRoleAndTarget(supabase, "u1")).toEqual({ role: "guild_admin", redirectTo: "/guild" });
  });

  it("routes a member editor to /admin with their member_id", async () => {
    const supabase = fakeSupabase({ profile: null, memberUser: { member_id: "m1" } });
    expect(await resolveUserRoleAndTarget(supabase, "u1")).toEqual({
      role: "member_editor",
      memberId: "m1",
      redirectTo: "/admin",
    });
  });

  it("treats is_guild_admin: false the same as no profiles row", async () => {
    const supabase = fakeSupabase({ profile: { is_guild_admin: false }, memberUser: { member_id: "m1" } });
    expect(await resolveUserRoleAndTarget(supabase, "u1")).toEqual({
      role: "member_editor",
      memberId: "m1",
      redirectTo: "/admin",
    });
  });

  it("falls back to /signin when the user has neither role", async () => {
    const supabase = fakeSupabase({ profile: null, memberUser: null });
    expect(await resolveUserRoleAndTarget(supabase, "u1")).toEqual({ role: "none", redirectTo: "/signin" });
  });
});

describe("resolveCallbackRedirect", () => {
  const admin = { role: "guild_admin", redirectTo: "/guild" } as const;
  const member = { role: "member_editor", memberId: "m1", redirectTo: "/admin" } as const;
  const none = { role: "none", redirectTo: "/signin" } as const;

  it("without next, routes by role exactly as before", () => {
    expect(resolveCallbackRedirect(admin, undefined, false)).toBe("/guild");
    expect(resolveCallbackRedirect(admin, undefined, true)).toBe("/guild");
    expect(resolveCallbackRedirect(member, undefined, false)).toBe("/admin");
    expect(resolveCallbackRedirect(none, undefined, false)).toBe("/signin");
  });

  it("sends a member to next", () => {
    expect(resolveCallbackRedirect(member, "/portal", false)).toBe("/portal");
  });

  it("sends someone with no member link yet to next, so /portal can accept their invite", () => {
    expect(resolveCallbackRedirect(none, "/portal", false)).toBe("/portal");
  });

  it("sends a Guild admin to /guild unless they're editing as a member", () => {
    expect(resolveCallbackRedirect(admin, "/portal", false)).toBe("/guild");
    expect(resolveCallbackRedirect(admin, "/portal", true)).toBe("/portal");
  });
});
