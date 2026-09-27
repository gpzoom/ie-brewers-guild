import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSuperAdmin, withSuperAdmin } from "@/lib/auth/super-admin";
import { saveBrandSettingsCore } from "@/lib/brand/brand-settings.server";
import { deleteCategoryCore } from "@/lib/categories/categories.server";
import { setTrailEligibleCore } from "@/lib/guild/member-admin-actions.server";

/**
 * A Guild admin can't do any super-admin-only action by calling the server
 * functions directly (docs/member-profiles.md, "Super admin" >
 * "Enforcement"). Each function's core runs against a fake signed-in
 * session: an ordinary Guild admin gets "Only the super admin can …" and
 * NOTHING else is read or written -- no brand row, no category delete, no
 * member update, no service-role client. The database refuses the same
 * writes on its own (supabase/tests/super_admin.test.sql).
 */

type Call = { kind: "from" | "rpc"; name: string };

function fakeSession(opts: { isSuperAdmin: boolean; signedIn?: boolean }) {
  const calls: Call[] = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: opts.signedIn === false ? null : { id: "user-1", email: "me@example.com" } },
        error: null,
      }),
    },
    from(table: string) {
      calls.push({ kind: "from", name: table });
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { is_guild_admin: true, is_super_admin: opts.isSuperAdmin },
                error: null,
              }),
            }),
          }),
        };
      }
      // Anything past the check: a chain that always succeeds.
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "update", "insert", "eq", "maybeSingle"]) {
        chain[method] = () => chain;
      }
      chain.then = (resolveFn: (r: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolveFn);
      return chain;
    },
    async rpc(name: string) {
      calls.push({ kind: "rpc", name });
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const pastTheCheck = (calls: Call[]) => calls.filter((c) => !(c.kind === "from" && c.name === "profiles"));

describe("requireSuperAdmin", () => {
  it("refuses a Guild admin who isn't the super admin", async () => {
    const { client } = fakeSession({ isSuperAdmin: false });
    await expect(requireSuperAdmin(client, "do this")).rejects.toThrow("Only the super admin can do this.");
  });

  it("refuses someone signed out", async () => {
    const { client } = fakeSession({ isSuperAdmin: true, signedIn: false });
    await expect(requireSuperAdmin(client, "do this")).rejects.toThrow("Not signed in.");
  });

  it("lets the super admin through, with who they are", async () => {
    const { client } = fakeSession({ isSuperAdmin: true });
    await expect(requireSuperAdmin(client, "do this")).resolves.toEqual({
      userId: "user-1",
      email: "me@example.com",
    });
  });
});

describe("withSuperAdmin", () => {
  it("never opens the service-role side for a Guild admin", async () => {
    const { client } = fakeSession({ isSuperAdmin: false });
    let opened = false;
    await expect(
      withSuperAdmin(client, "invite a Guild admin", async () => {
        opened = true;
      }),
    ).rejects.toThrow("Only the super admin can invite a Guild admin.");
    expect(opened).toBe(false);
  });

  it("opens it for the super admin", async () => {
    const { client } = fakeSession({ isSuperAdmin: true });
    const result = await withSuperAdmin(client, "x", async () => "service");
    expect(result.value).toBe("service");
  });
});

describe("a Guild admin calling super-admin-only server functions directly", () => {
  it("can't save brand settings", async () => {
    const { client, calls } = fakeSession({ isSuperAdmin: false });
    await expect(
      saveBrandSettingsCore(
        { hue: 40, brandLightness: 0.5, brandBrightLightness: 0.75, fontPairingId: "x" },
        client,
      ),
    ).rejects.toThrow("Only the super admin can change the site's brand.");
    expect(pastTheCheck(calls)).toEqual([]);
  });

  it("can't delete a category", async () => {
    const { client, calls } = fakeSession({ isSuperAdmin: false });
    await expect(deleteCategoryCore("cat-1", client)).rejects.toThrow(
      "Only the super admin can delete a category.",
    );
    expect(pastTheCheck(calls)).toEqual([]);
  });

  it("can't flip the Trail switch", async () => {
    const { client, calls } = fakeSession({ isSuperAdmin: false });
    await expect(setTrailEligibleCore({ memberId: "m1", eligible: true }, client)).rejects.toThrow(
      "Only the super admin can change who's on the Trail.",
    );
    expect(pastTheCheck(calls)).toEqual([]);
  });

  it("the super admin can delete a category (through delete_category())", async () => {
    const { client, calls } = fakeSession({ isSuperAdmin: true });
    await deleteCategoryCore("cat-1", client);
    expect(pastTheCheck(calls)).toEqual([{ kind: "rpc", name: "delete_category" }]);
  });
});

/**
 * The Guild admins and audit log server functions build their service-role
 * client only through the gate. Guard against a new export skipping it.
 */
describe("every super-admin server function goes through the gate", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf-8");
  const exportedServerFns = (source: string) =>
    source.split(/\nexport const /).slice(1).filter((chunk) => chunk.includes("createServerFn("));

  it("guild-admins.server.ts", () => {
    const fns = exportedServerFns(read("src/lib/guild/guild-admins.server.ts"));
    expect(fns.length).toBe(5);
    for (const fn of fns) expect(fn).toContain("superAdminStore(");
  });

  it("audit-log-view.server.ts", () => {
    const fns = exportedServerFns(read("src/lib/guild/audit-log-view.server.ts"));
    expect(fns.length).toBe(1);
    for (const fn of fns) expect(fn).toContain("withSuperAdmin(");
  });

  it("delete member and the sign-in email change check first", () => {
    expect(read("src/lib/guild/delete-member.server.ts")).toContain(
      'requireSuperAdmin(sessionClient, "delete a member")',
    );
    expect(read("src/lib/members/member-email.server.ts")).toContain(
      `requireSuperAdmin(sessionClient, "change a member's sign-in email")`,
    );
  });
});
