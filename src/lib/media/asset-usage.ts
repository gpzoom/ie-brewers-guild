/**
 * Where a gallery photo is in use, for the gallery's delete check (plan
 * Decision 5: deleting a photo the live profile or the draft uses is
 * blocked, with a message saying where). Pure, so the rule and its wording
 * are tested without a database.
 */

export type AssetUsage =
  | "live_logo"
  | "live_cover"
  | "live_social_image"
  | "live_slide"
  | "draft_logo"
  | "draft_cover"
  | "draft_social_image"
  | "draft_slide";

type LiveMemberRefs = {
  logo_asset_id: string | null;
  cover_asset_id: string | null;
  og_image_asset_id: string | null;
};

export function findAssetUsages(args: {
  assetId: string;
  live: LiveMemberRefs | null;
  liveSlideAssetIds: readonly string[];
  /** member_drafts.data as stored (any shape; missing keys are fine). */
  draftData: unknown;
}): AssetUsage[] {
  const { assetId, live } = args;
  const usages: AssetUsage[] = [];
  if (live?.logo_asset_id === assetId) usages.push("live_logo");
  if (live?.cover_asset_id === assetId) usages.push("live_cover");
  if (live?.og_image_asset_id === assetId) usages.push("live_social_image");
  if (args.liveSlideAssetIds.includes(assetId)) usages.push("live_slide");

  const data = (
    args.draftData && typeof args.draftData === "object" ? args.draftData : {}
  ) as Record<string, unknown>;
  const basics = (data.basics && typeof data.basics === "object" ? data.basics : {}) as Record<
    string,
    unknown
  >;
  const media = (data.media && typeof data.media === "object" ? data.media : {}) as Record<
    string,
    unknown
  >;
  if (basics.logo_asset_id === assetId) usages.push("draft_logo");
  if (basics.cover_asset_id === assetId) usages.push("draft_cover");
  if (basics.og_image_asset_id === assetId) usages.push("draft_social_image");
  const slides = Array.isArray(media.slides) ? media.slides : [];
  if (
    slides.some(
      (slide) =>
        slide &&
        typeof slide === "object" &&
        (slide as Record<string, unknown>).asset_id === assetId,
    )
  ) {
    usages.push("draft_slide");
  }
  return usages;
}

const PLACE_LABEL: Record<"logo" | "cover" | "social_image" | "slide", string> = {
  logo: "your logo",
  cover: "your cover photo",
  social_image: "your social sharing image",
  slide: "a carousel slide",
};

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/**
 * The member-facing reason a delete was refused, or null when the photo
 * isn't used anywhere. Groups by place and says whether it's on the live
 * page, in unpublished changes, or both, e.g.
 * "This photo is used as your cover photo (on your live page) and a
 * carousel slide (in your unpublished changes). Choose a different photo
 * there first, then delete it."
 */
export function assetInUseMessage(usages: readonly AssetUsage[]): string | null {
  if (usages.length === 0) return null;
  const places = ["logo", "cover", "social_image", "slide"] as const;
  const parts: string[] = [];
  for (const place of places) {
    const live = usages.includes(`live_${place}` as AssetUsage);
    const draft = usages.includes(`draft_${place}` as AssetUsage);
    if (!live && !draft) continue;
    const where =
      live && draft
        ? "on your live page and in your unpublished changes"
        : live
          ? "on your live page"
          : "in your unpublished changes";
    parts.push(`${PLACE_LABEL[place]} (${where})`);
  }
  const onlyLive = usages.every((usage) => usage.startsWith("live_"));
  const fix = onlyLive
    ? "Choose a different photo there and publish, then delete it."
    : "Choose a different photo there first, then delete it.";
  return `This photo is used as ${joinList(parts)}. ${fix}`;
}
