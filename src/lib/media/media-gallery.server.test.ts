import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteMediaAssetCore } from "./media-gallery.server";

type Result = { data: unknown; error: { message: string } | null };

/**
 * Minimal chainable stand-in for the PostgREST builder: every filter
 * returns the same builder, and the result is picked by (table, whether
 * .delete() was called) when it's awaited or .maybeSingle()'d. Records the
 * order of deletes and their filters so the test can assert slides go
 * before the asset.
 */
function fakeClient(opts: {
  asset: { id: string; member_id: string } | null;
  slideIds?: string[];
  slidesError?: { message: string } | null;
  assetDeleteRows?: Array<{ id: string; storage_path: string; member_id: string }>;
  removeError?: { message: string } | null;
}) {
  const deletes: Array<{ table: string; filters: string[] }> = [];
  const removed: string[][] = [];

  const client = {
    from(table: string) {
      let isDelete = false;
      const filters: string[] = [];
      const resolveResult = (): Result => {
        if (table === "media_assets" && !isDelete) return { data: opts.asset, error: null };
        if (table === "carousel_slides" && isDelete) {
          return {
            data: (opts.slideIds ?? []).map((id) => ({ id })),
            error: opts.slidesError ?? null,
          };
        }
        if (table === "media_assets" && isDelete)
          return { data: opts.assetDeleteRows ?? [], error: null };
        throw new Error(`unexpected ${table} query`);
      };
      const builder = {
        select: () => builder,
        delete: () => {
          isDelete = true;
          deletes.push({ table, filters });
          return builder;
        },
        eq: (column: string, value: string) => {
          filters.push(`${column}=${value}`);
          return builder;
        },
        maybeSingle: async () => resolveResult(),
        then: (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => {
          try {
            return Promise.resolve(resolve(resolveResult()));
          } catch (e) {
            return Promise.resolve(reject(e));
          }
        },
      };
      return builder;
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          removed.push(paths);
          return { data: null, error: opts.removeError ?? null };
        },
      }),
    },
  } as unknown as SupabaseClient;

  return { client, deletes, removed };
}

function auditSpy() {
  const entries: Array<{
    tableName: string;
    rowId: string | null;
    action: string;
    memberId: string;
  }> = [];
  const record = async (entry: {
    memberId: string;
    tableName: string;
    rowId: string | null;
    action: string;
  }) => {
    entries.push(entry);
  };
  return { entries, record };
}

describe("deleteMediaAssetCore", () => {
  it("removes the photo's carousel slides first, then the asset, and audit-logs each", async () => {
    const { client, deletes, removed } = fakeClient({
      asset: { id: "asset-1", member_id: "member-1" },
      slideIds: ["slide-a", "slide-b"],
      assetDeleteRows: [{ id: "asset-1", storage_path: "member-1/x.jpg", member_id: "member-1" }],
    });
    const audit = auditSpy();

    const result = await deleteMediaAssetCore("asset-1", client, audit.record);

    expect(result).toEqual({
      ok: true,
      fileRemoved: true,
      removedSlideIds: ["slide-a", "slide-b"],
    });
    expect(deletes.map((d) => d.table)).toEqual(["carousel_slides", "media_assets"]);
    expect(deletes[0].filters).toEqual(["asset_id=asset-1", "member_id=member-1"]);
    expect(removed).toEqual([["member-1/x.jpg"]]);
    expect(audit.entries).toEqual([
      { memberId: "member-1", tableName: "carousel_slides", rowId: "slide-a", action: "delete" },
      { memberId: "member-1", tableName: "carousel_slides", rowId: "slide-b", action: "delete" },
      { memberId: "member-1", tableName: "media_assets", rowId: "asset-1", action: "delete" },
    ]);
  });

  it("works for a photo that isn't in the carousel", async () => {
    const { client } = fakeClient({
      asset: { id: "asset-1", member_id: "member-1" },
      assetDeleteRows: [{ id: "asset-1", storage_path: "member-1/x.jpg", member_id: "member-1" }],
    });
    const audit = auditSpy();
    const result = await deleteMediaAssetCore("asset-1", client, audit.record);
    expect(result.removedSlideIds).toEqual([]);
    expect(audit.entries.map((e) => e.tableName)).toEqual(["media_assets"]);
  });

  it("refuses (and touches nothing) when the asset isn't visible to the caller", async () => {
    const { client, deletes } = fakeClient({ asset: null });
    const audit = auditSpy();
    await expect(deleteMediaAssetCore("asset-1", client, audit.record)).rejects.toThrow(
      /permission/,
    );
    expect(deletes).toEqual([]);
    expect(audit.entries).toEqual([]);
  });

  it("does not delete the asset if removing its slides fails", async () => {
    const { client, deletes } = fakeClient({
      asset: { id: "asset-1", member_id: "member-1" },
      slidesError: { message: "boom" },
    });
    await expect(deleteMediaAssetCore("asset-1", client, auditSpy().record)).rejects.toThrow(
      "boom",
    );
    expect(deletes.map((d) => d.table)).toEqual(["carousel_slides"]);
  });

  it("reports an RLS-blocked asset delete (zero rows) as a failure", async () => {
    const { client } = fakeClient({
      asset: { id: "asset-1", member_id: "member-1" },
      assetDeleteRows: [],
    });
    await expect(deleteMediaAssetCore("asset-1", client, auditSpy().record)).rejects.toThrow(
      /permission/,
    );
  });

  it("reports a storage cleanup failure as non-fatal", async () => {
    const { client } = fakeClient({
      asset: { id: "asset-1", member_id: "member-1" },
      assetDeleteRows: [{ id: "asset-1", storage_path: "member-1/x.jpg", member_id: "member-1" }],
      removeError: { message: "nope" },
    });
    const result = await deleteMediaAssetCore("asset-1", client, auditSpy().record);
    expect(result.fileRemoved).toBe(false);
  });
});
