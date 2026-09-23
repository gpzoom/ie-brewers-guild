import { afterEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above imports -- fakes they close over must
// be created via vi.hoisted rather than plain top-level consts. Same
// mocking shape as hours-stale-cron.server.test.ts's own
// getSupabaseServiceRoleClient mock: models the exact `.from("members")`
// call chain updateMemberDiscount's handler actually uses
// (`.update(patch).eq("id", memberId).select("id")`), and records every
// patch object that ever reaches `.update()` so a test can assert on
// exactly what got through the allowlist filter -- not just on the
// function's return value.
const { updateCalls, updateResult } = vi.hoisted(() => ({
  updateCalls: [] as Array<{ patch: Record<string, unknown>; memberId: string }>,
  updateResult: {
    data: [{ id: "member-1" }] as Array<{ id: string }> | null,
    error: null as { message: string } | null,
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClientForRequest: async () => ({
    from: (table: string) => {
      if (table !== "members") throw new Error(`unexpected table: ${table}`);
      return {
        update: (patch: Record<string, unknown>) => ({
          eq: (_column: string, memberId: string) => ({
            select: async (_cols: string) => {
              updateCalls.push({ patch, memberId });
              return updateResult;
            },
          }),
        }),
      };
    },
  }),
}));

const { assertValidDiscountPercent, filterDiscountPatch, updateMemberDiscount } =
  await import("./discount.server");

describe("filterDiscountPatch -- runtime column allowlist", () => {
  it("passes through the three legitimate discount fields unchanged", () => {
    const patch = {
      discount_percent: 15,
      discount_no_fixed_percent: false,
      discount_redeem_text: "Show your Guild card at checkout",
    };
    expect(filterDiscountPatch(patch)).toEqual(patch);
  });

  /**
   * The concrete mass-assignment case this function exists to stop: a
   * forged patch object (not built through DiscountEditor's typed object
   * literals -- e.g. a raw HTTP request to updateMemberDiscount's RPC
   * endpoint) that piggybacks dangerous `members` columns onto an
   * otherwise-legitimate discount update. Without this filter, every one
   * of theme/member_type/logo_asset_id below would reach
   * `supabase.from("members").update(patch)` unfiltered, since
   * DiscountPatch's TypeScript restriction is erased at runtime and
   * inputValidator is just an identity function.
   */
  it("strips forged extra columns (theme, member_type, logo_asset_id) that aren't in the discount allowlist", () => {
    const forged = {
      discount_percent: 5,
      theme: "hacked",
      member_type: "producer",
      logo_asset_id: "<attacker-controlled-asset>",
    };
    const filtered = filterDiscountPatch(forged);
    expect(filtered).toEqual({ discount_percent: 5 });
    expect(filtered).not.toHaveProperty("theme");
    expect(filtered).not.toHaveProperty("member_type");
    expect(filtered).not.toHaveProperty("logo_asset_id");
  });

  it("strips a forged column even when no legitimate discount field is present at all", () => {
    const forged = { status: "published", approved_at: "2026-01-01T00:00:00.000Z" };
    expect(filterDiscountPatch(forged)).toEqual({});
  });

  it("rejects a non-object raw patch (null) instead of throwing a raw TypeError", () => {
    expect(() => filterDiscountPatch(null)).toThrow("Invalid update.");
  });

  it("rejects a non-object raw patch (a string) instead of throwing a raw TypeError", () => {
    expect(() => filterDiscountPatch("discount_percent")).toThrow("Invalid update.");
  });

  it("rejects an array raw patch instead of silently producing index-keyed garbage", () => {
    expect(() => filterDiscountPatch([1, 2, 3])).toThrow("Invalid update.");
  });
});

describe("assertValidDiscountPercent -- server-side range validation", () => {
  it("accepts the lower boundary, exactly 0", () => {
    expect(() => assertValidDiscountPercent(0)).not.toThrow();
  });

  it("accepts the upper boundary, exactly 100", () => {
    expect(() => assertValidDiscountPercent(100)).not.toThrow();
  });

  it("accepts an ordinary in-range value", () => {
    expect(() => assertValidDiscountPercent(15)).not.toThrow();
  });

  it("rejects a negative value", () => {
    expect(() => assertValidDiscountPercent(-5)).toThrow(/between 0 and 100/);
  });

  it("rejects a value far above the business range", () => {
    expect(() => assertValidDiscountPercent(500)).toThrow(/between 0 and 100/);
  });

  it("rejects a value just past the upper boundary", () => {
    expect(() => assertValidDiscountPercent(101)).toThrow(/between 0 and 100/);
  });

  it("rejects NaN", () => {
    expect(() => assertValidDiscountPercent(NaN)).toThrow(/between 0 and 100/);
  });

  it("rejects Infinity", () => {
    expect(() => assertValidDiscountPercent(Infinity)).toThrow(/between 0 and 100/);
  });

  it("allows null -- clearing the percent is legitimate, not a validation failure", () => {
    expect(() => assertValidDiscountPercent(null)).not.toThrow();
  });

  it("allows undefined -- an absent field on a partial patch is not a validation failure", () => {
    expect(() => assertValidDiscountPercent(undefined)).not.toThrow();
  });
});

describe("updateMemberDiscount -- end-to-end handler behavior", () => {
  afterEach(() => {
    updateCalls.length = 0;
    updateResult.data = [{ id: "member-1" }];
    updateResult.error = null;
  });

  /**
   * Full-stack proof (not just the pure filterDiscountPatch unit test
   * above) that a forged extra field never reaches the mocked
   * `.update()` call -- i.e. that the handler actually calls
   * filterDiscountPatch before touching Supabase, using the same forged
   * payload a raw HTTP request bypassing DiscountEditor's TypeScript
   * layer could send.
   */
  it("strips a forged extra field before it ever reaches supabase.from('members').update()", async () => {
    const forged = {
      discount_percent: 5,
      theme: "hacked",
      member_type: "producer",
      logo_asset_id: "<attacker-controlled-asset>",
    } as unknown as Parameters<typeof updateMemberDiscount>[0]["data"]["patch"];

    await updateMemberDiscount({ data: { memberId: "member-1", patch: forged } });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch).toEqual({ discount_percent: 5, discount_no_fixed_percent: false });
    expect(updateCalls[0].patch).not.toHaveProperty("theme");
    expect(updateCalls[0].patch).not.toHaveProperty("member_type");
    expect(updateCalls[0].patch).not.toHaveProperty("logo_asset_id");
  });

  it("rejects an out-of-range discount_percent before any update() call is made", async () => {
    await expect(
      updateMemberDiscount({ data: { memberId: "member-1", patch: { discount_percent: -5 } } }),
    ).rejects.toThrow(/between 0 and 100/);
    expect(updateCalls).toHaveLength(0);
  });

  it("accepts the boundary value discount_percent: 100 and saves it", async () => {
    await updateMemberDiscount({
      data: { memberId: "member-1", patch: { discount_percent: 100 } },
    });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch.discount_percent).toBe(100);
  });

  it("accepts the boundary value discount_percent: 0 and saves it", async () => {
    await updateMemberDiscount({ data: { memberId: "member-1", patch: { discount_percent: 0 } } });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch.discount_percent).toBe(0);
  });

  /** XOR: setting no_fixed_percent true clears discount_percent in the same patch. */
  it("nulls out discount_percent when discount_no_fixed_percent is set true", async () => {
    await updateMemberDiscount({
      data: { memberId: "member-1", patch: { discount_no_fixed_percent: true } },
    });
    expect(updateCalls[0].patch).toEqual({
      discount_no_fixed_percent: true,
      discount_percent: null,
    });
  });

  /** XOR: setting a numeric discount_percent clears discount_no_fixed_percent in the same patch. */
  it("clears discount_no_fixed_percent when a numeric discount_percent is set", async () => {
    await updateMemberDiscount({
      data: { memberId: "member-1", patch: { discount_percent: 20 } },
    });
    expect(updateCalls[0].patch).toEqual({
      discount_percent: 20,
      discount_no_fixed_percent: false,
    });
  });

  it("throws when the filtered patch is empty (only forged/unknown fields were sent)", async () => {
    const forged = { status: "published" } as unknown as Parameters<
      typeof updateMemberDiscount
    >[0]["data"]["patch"];
    await expect(
      updateMemberDiscount({ data: { memberId: "member-1", patch: forged } }),
    ).rejects.toThrow("No discount fields to update.");
    expect(updateCalls).toHaveLength(0);
  });

  /**
   * Row-count check: PostgREST reports an RLS-denied UPDATE as success
   * (`error: null`) with zero rows affected, not as an `error` -- the
   * mocked client below reproduces that exact shape.
   */
  it("throws a clear error when the update affects zero rows (RLS denial)", async () => {
    updateResult.data = [];
    await expect(
      updateMemberDiscount({
        data: { memberId: "member-1", patch: { discount_redeem_text: "hi" } },
      }),
    ).rejects.toThrow("Save failed");
  });
});
