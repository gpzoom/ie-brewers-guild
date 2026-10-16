import { describe, expect, it } from "vitest";
import { assetInUseMessage, findAssetUsages } from "./asset-usage";

const NONE = { logo_asset_id: null, cover_asset_id: null, og_image_asset_id: null };

describe("findAssetUsages", () => {
  it("finds nothing for an unused photo", () => {
    expect(
      findAssetUsages({ assetId: "a", live: NONE, liveSlideAssetIds: ["b"], draftData: null }),
    ).toEqual([]);
  });

  it("finds live logo, cover, social image and slides", () => {
    expect(
      findAssetUsages({
        assetId: "a",
        live: { logo_asset_id: "a", cover_asset_id: "a", og_image_asset_id: "a" },
        liveSlideAssetIds: ["a"],
        draftData: null,
      }),
    ).toEqual(["live_logo", "live_cover", "live_social_image", "live_slide"]);
  });

  it("finds draft uses in any section shape", () => {
    expect(
      findAssetUsages({
        assetId: "a",
        live: NONE,
        liveSlideAssetIds: [],
        draftData: {
          basics: { logo_asset_id: "a", cover_asset_id: "x", og_image_asset_id: "a" },
          media: { slides: [{ asset_id: "x" }, { asset_id: "a" }] },
        },
      }),
    ).toEqual(["draft_logo", "draft_social_image", "draft_slide"]);
  });

  it("copes with a missing or malformed draft", () => {
    expect(
      findAssetUsages({
        assetId: "a",
        live: null,
        liveSlideAssetIds: [],
        draftData: { media: { slides: "?" } },
      }),
    ).toEqual([]);
  });

  it("in a one-manager business, finds another location's live or drafted look photo", () => {
    expect(
      findAssetUsages({
        assetId: "a",
        live: NONE,
        liveSlideAssetIds: [],
        draftData: null,
        otherLocations: [
          { live: { ...NONE, logo_asset_id: "a" }, draftData: null },
          { live: NONE, draftData: { basics: { cover_asset_id: "a" } } },
        ],
      }),
    ).toEqual(["other_logo", "other_cover"]);
  });

  it("another location's slides never count (slides stay in their own gallery)", () => {
    expect(
      findAssetUsages({
        assetId: "a",
        live: NONE,
        liveSlideAssetIds: [],
        draftData: null,
        otherLocations: [{ live: NONE, draftData: { media: { slides: [{ asset_id: "a" }] } } }],
      }),
    ).toEqual([]);
  });
});

describe("assetInUseMessage", () => {
  it("is null when unused", () => {
    expect(assetInUseMessage([])).toBeNull();
  });

  it("says where, live only, and to publish the change", () => {
    expect(assetInUseMessage(["live_cover"])).toBe(
      "This photo is used as your cover photo (on your live page). Choose a different photo there and publish, then delete it.",
    );
  });

  it("names draft-only uses", () => {
    expect(assetInUseMessage(["draft_slide"])).toBe(
      "This photo is used as a carousel slide (in your unpublished changes). Choose a different photo there first, then delete it.",
    );
  });

  it("combines places and both versions", () => {
    expect(assetInUseMessage(["live_logo", "draft_logo", "draft_social_image", "live_slide"])).toBe(
      "This photo is used as your logo (on your live page and in your unpublished changes), your social sharing image (in your unpublished changes), and a carousel slide (on your live page). Choose a different photo there first, then delete it.",
    );
  });

  it("another location's use names the business and that it can't be deleted", () => {
    expect(assetInUseMessage(["other_logo"], { businessName: "Hangar 24 Brewing Co." })).toBe(
      "This photo is used as the logo of another Hangar 24 Brewing Co. location, so it can't be deleted.",
    );
  });

  it("another location's cover and link preview together", () => {
    expect(
      assetInUseMessage(["other_cover", "other_social_image"], { businessName: "Hangar 24 Brewing Co." }),
    ).toBe(
      "This photo is used as the cover photo and link preview image of another Hangar 24 Brewing Co. location, so it can't be deleted.",
    );
  });

  it("own use first, then another location's", () => {
    expect(
      assetInUseMessage(["live_cover", "other_logo"], { businessName: "Hangar 24 Brewing Co." }),
    ).toBe(
      "This photo is used as your cover photo (on your live page). Choose a different photo there and publish, then delete it. It's also the logo of another Hangar 24 Brewing Co. location.",
    );
  });

  it("without a business name, still says another location", () => {
    expect(assetInUseMessage(["other_logo"])).toBe(
      "This photo is used as the logo of another location, so it can't be deleted.",
    );
  });
});
