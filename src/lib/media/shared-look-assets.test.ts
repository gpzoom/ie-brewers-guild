import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadLookAssets,
  lookAssetIds,
  membersShowingLookAsset,
  sharedLookMembersForAsset,
} from "./shared-look-assets";

describe("lookAssetIds", () => {
  it("collects the logo, cover and link preview of each source, once each", () => {
    expect(
      lookAssetIds(
        { logo_asset_id: "l1", cover_asset_id: "c1", og_image_asset_id: null },
        { logo_asset_id: "l1", cover_asset_id: "c2", og_image_asset_id: "o1" },
        null,
        undefined,
      ),
    ).toEqual(["l1", "c1", "c2", "o1"]);
  });

  it("is empty with nothing set", () => {
    expect(lookAssetIds({ logo_asset_id: null }, null)).toEqual([]);
  });
});

describe("membersShowingLookAsset", () => {
  const siblings = [
    { id: "m2", logo_asset_id: null, cover_asset_id: "c1", og_image_asset_id: null },
    { id: "m3", logo_asset_id: null, cover_asset_id: null, og_image_asset_id: null },
    { id: "m4", logo_asset_id: null, cover_asset_id: null, og_image_asset_id: null },
  ];
  const drafts = [
    { member_id: "m3", data: { basics: { og_image_asset_id: "c1" } } },
    { member_id: "m4", data: { basics: { cover_asset_id: "other" }, media: { slides: [{ asset_id: "c1" }] } } },
  ];

  it("the locations whose live or draft logo, cover or link preview is the asset", () => {
    expect(membersShowingLookAsset("c1", siblings, drafts)).toEqual(["m2", "m3"]);
  });

  it("a carousel slide doesn't count", () => {
    expect(membersShowingLookAsset("c1", siblings, drafts)).not.toContain("m4");
  });

  it("an asset no location shows: none", () => {
    expect(membersShowingLookAsset("gallery-only", siblings, drafts)).toEqual([]);
  });
});

/** A client whose every read comes back as an error. */
function failingService() {
  const failing: Record<string, unknown> = {};
  for (const k of ["select", "eq", "neq", "in", "not"]) failing[k] = () => failing;
  failing.maybeSingle = async () => ({ data: null, error: { message: "boom" } });
  failing.then = (resolve: (r: unknown) => unknown) =>
    Promise.resolve(resolve({ data: null, error: { message: "boom" } }));
  return { from: () => failing } as unknown as SupabaseClient;
}

describe("the look-asset lookups degrade instead of failing the page", () => {
  it("loadLookAssets is empty when a read fails", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadLookAssets(failingService(), "m1", { cover_asset_id: "c1" })).toEqual([]);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it("sharedLookMembersForAsset is empty when a read fails (the route then 404s as before)", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sharedLookMembersForAsset(failingService(), { id: "c1", member_id: "m1" }, "u1")).toEqual([]);
    errors.mockRestore();
  });
});
