import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadSharedLook,
  sharedLookChangeRefusal,
  sharedLookNote,
  sharedLookRefusal,
  type SharedLook,
} from "./shared-look";

const managerLook: SharedLook = {
  businessName: "Hangar 24 Brewing Co.",
  locationCount: 4,
  canChange: true,
  managerLabel: "boss@x.com",
};

describe("sharedLookNote", () => {
  it("the manager (or a Guild admin) sees the location count", () => {
    expect(sharedLookNote(managerLook)).toBe("Shared by all 4 locations");
  });

  it("everyone else is told who manages it", () => {
    expect(sharedLookNote({ ...managerLook, canChange: false })).toBe(
      "Shared by all Hangar 24 Brewing Co. locations. boss@x.com manages this.",
    );
  });
});

describe("sharedLookRefusal", () => {
  it("uses the database's own wording", () => {
    expect(sharedLookRefusal({ ...managerLook, canChange: false })).toBe(
      "The logo, cover and theme are shared by all Hangar 24 Brewing Co. locations. boss@x.com manages them.",
    );
  });
});

describe("sharedLookChangeRefusal", () => {
  it("allows a member outside a one-manager business", () => {
    expect(sharedLookChangeRefusal(null)).toBeNull();
  });

  it("allows the manager or a Guild admin", () => {
    expect(sharedLookChangeRefusal(managerLook)).toBeNull();
  });

  it("refuses everyone else with the database's wording", () => {
    expect(sharedLookChangeRefusal({ ...managerLook, canChange: false })).toBe(
      "The logo, cover and theme are shared by all Hangar 24 Brewing Co. locations. boss@x.com manages them.",
    );
  });
});

type MemberRow = {
  business_id: string | null;
  businesses: { name: string; management_mode: string; manager_user_id: string | null } | null;
} | null;

function fakeService(opts: { member: MemberRow; count?: number; managerEmail?: string | null }) {
  return {
    from(table: string) {
      if (table !== "members") throw new Error(`unexpected table ${table}`);
      return {
        select: (_cols: string, options?: { count?: string; head?: boolean }) => ({
          eq: () =>
            options?.head
              ? Promise.resolve({ count: opts.count ?? 0, data: null, error: null })
              : { maybeSingle: async () => ({ data: opts.member, error: null }) },
        }),
      };
    },
    auth: {
      admin: {
        getUserById: async () => ({
          data: opts.managerEmail ? { user: { email: opts.managerEmail } } : { user: null },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;
}

const oneManager: MemberRow = {
  business_id: "b1",
  businesses: { name: "Hangar 24 Brewing Co.", management_mode: "one_manager", manager_user_id: "boss" },
};

describe("loadSharedLook", () => {
  it("is null for a member with no business", async () => {
    const service = fakeService({ member: { business_id: null, businesses: null } });
    expect(await loadSharedLook(service, "m1", { userId: "u1", isGuildAdmin: false })).toBeNull();
  });

  it("is null for a business whose locations are managed separately", async () => {
    const service = fakeService({
      member: {
        business_id: "b1",
        businesses: { name: "Hangar 24 Brewing Co.", management_mode: "separate", manager_user_id: null },
      },
      count: 4,
    });
    expect(await loadSharedLook(service, "m1", { userId: "u1", isGuildAdmin: true })).toBeNull();
  });

  it("the business manager can change it", async () => {
    const service = fakeService({ member: oneManager, count: 4, managerEmail: "boss@x.com" });
    expect(await loadSharedLook(service, "m1", { userId: "boss", isGuildAdmin: false })).toEqual({
      businessName: "Hangar 24 Brewing Co.",
      locationCount: 4,
      canChange: true,
      managerLabel: "boss@x.com",
    });
  });

  it("a Guild admin can change it", async () => {
    const service = fakeService({ member: oneManager, count: 4, managerEmail: "boss@x.com" });
    const look = await loadSharedLook(service, "m1", { userId: "admin", isGuildAdmin: true });
    expect(look?.canChange).toBe(true);
  });

  it("a location's own editor can't", async () => {
    const service = fakeService({ member: oneManager, count: 4, managerEmail: "boss@x.com" });
    const look = await loadSharedLook(service, "m1", { userId: "u1", isGuildAdmin: false });
    expect(look?.canChange).toBe(false);
    expect(look?.managerLabel).toBe("boss@x.com");
  });

  it("with no manager yet, the Guild manages it", async () => {
    const service = fakeService({
      member: { ...oneManager!, businesses: { ...oneManager!.businesses!, manager_user_id: null } },
      count: 2,
    });
    const look = await loadSharedLook(service, "m1", { userId: "u1", isGuildAdmin: false });
    expect(look).toEqual({
      businessName: "Hangar 24 Brewing Co.",
      locationCount: 2,
      canChange: false,
      managerLabel: "The Guild",
    });
  });
});
