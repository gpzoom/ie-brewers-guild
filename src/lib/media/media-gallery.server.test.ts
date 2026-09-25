import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteMediaAssetCore } from "./media-gallery.server";

type Result = { data: unknown; error: { message: string } | null };

/**
 * Minimal chainable stand-in for the PostgREST builder: every filter
 * returns the same builder, and the result is picked by (table, whether
 * .delete() was called) when it's awaited or .maybeSingle()'d. Records
 * every delete so a test can assert nothing was deleted when a photo is in
 * use.
 */
function fakeClient(opts: {
  asset: { id: string; member_id: string } | null;
  member?: {
    logo_asset_id: string | null;
    cover_asset_id: string | null;
    og_image_asset_id: string | null;
  };
  liveSlideAssetIds?: string[];
  draftData?: unknown;
  readError?: { message: string } | null;
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
        if (table === "members") {
          return {
            data: opts.member ?? {
              logo_asset_id: null,
              cover_asset_id: null,
              og_image_asset_id: null,
            },
            error: opts.readError ?? null,
          };
        }
        if (table === "carousel_slides") {
          return {
            data: (opts.liveSlideAssetIds ?? []).map((asset_id) => ({ asset_id })),
            error: null,
          };
        }
        if (table === "member_drafts") {
          return {
            data: opts.draftData === undefined ? null : { data: opts.draftData },
            error: null,
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

const ASSET = { id: "asset-1", member_id: "member-1" };
const DELETED_ROW = [{ id: "asset-1", storage_path: "member-1/x.jpg", member_id: "member-1" }];

describe("deleteMediaAssetCore", () => {
  it("deletes an unused photo and audit-logs it", async () => {
    const { client, deletes, removed } = fakeClient({ asset: ASSET, assetDeleteRows: DELETED_ROW });
    const audit = auditSpy();

    const result = await deleteMediaAssetCore("asset-1", client, audit.record);

    expect(result).toEqual({ ok: true, fileRemoved: true });
    expect(deletes.map((d) => d.table)).toEqual(["media_assets"]);
    expect(removed).toEqual([["member-1/x.jpg"]]);
    expect(audit.entries).toEqual([
      { memberId: "member-1", tableName: "media_assets", rowId: "asset-1", action: "delete" },
    ]);
  });

  it("refuses a photo in the live carousel, says where, and deletes nothing", async () => {
    const { client, deletes } = fakeClient({ asset: ASSET, liveSlideAssetIds: ["asset-1"] });
    await expect(deleteMediaAssetCore("asset-1", client, auditSpy().record)).rejects.toThrow(
      /a carousel slide \(on your live page\)/,
    );
    expect(deletes).toEqual([]);
  });

  it("refuses a photo that's only the draft's cover", async () => {
    const { client, deletes } = fakeClient({
      asset: ASSET,
      draftData: { basics: { cover_asset_id: "asset-1" }, media: { slides: [] } },
    });
    await expect(deleteMediaAssetCore("asset-1", client, auditSpy().record)).rejects.toThrow(
      /your cover photo \(in your unpublished changes\)/,
    );
    expect(deletes).toEqual([]);
  });

  it("refuses a photo that's the live logo", async () => {
    const { client } = fakeClient({
      asset: ASSET,
      member: { logo_asset_id: "asset-1", cover_asset_id: null, og_image_asset_id: null },
    });
    await expect(deleteMediaAssetCore("asset-1", client, auditSpy().record)).rejects.toThrow(
      /your logo/,
    );
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

  it("refuses when it can't check where the photo is used", async () => {
    const { client, deletes } = fakeClient({ asset: ASSET, readError: { message: "boom" } });
    await expect(deleteMediaAssetCore("asset-1", client, auditSpy().record)).rejects.toThrow(
      /boom/,
    );
    expect(deletes).toEqual([]);
  });

  it("reports an RLS-blocked asset delete (zero rows) as a failure", async () => {
    const { client } = fakeClient({ asset: ASSET, assetDeleteRows: [] });
    await expect(deleteMediaAssetCore("asset-1", client, auditSpy().record)).rejects.toThrow(
      /permission/,
    );
  });

  it("reports a storage cleanup failure as non-fatal", async () => {
    const { client } = fakeClient({
      asset: ASSET,
      assetDeleteRows: DELETED_ROW,
      removeError: { message: "nope" },
    });
    const result = await deleteMediaAssetCore("asset-1", client, auditSpy().record);
    expect(result.fileRemoved).toBe(false);
  });
});
