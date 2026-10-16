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
  | "draft_slide"
  /** Another location of a one-manager business uses it (live or drafted). */
  | "other_logo"
  | "other_cover"
  | "other_social_image";

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
  /**
   * The other locations of a one-manager business (multi-location part 4):
   * their logo, cover and link-preview image -- live or drafted -- may be
   * this location's photo (the shared look lives in one gallery). Slides
   * always stay in their own location's gallery, so they aren't checked.
   */
  otherLocations?: ReadonlyArray<{ live: LiveMemberRefs | null; draftData: unknown }>;
}): AssetUsage[] {
  const { assetId } = args;
  const usages: AssetUsage[] = [];
  const add = (usage: AssetUsage) => {
    if (!usages.includes(usage)) usages.push(usage);
  };
  const otherLocationUsages = (live: LiveMemberRefs | null, draftData: unknown) => {
    const basics = asRecord(asRecord(draftData).basics);
    if (live?.logo_asset_id === assetId || basics.logo_asset_id === assetId) add("other_logo");
    if (live?.cover_asset_id === assetId || basics.cover_asset_id === assetId) add("other_cover");
    if (live?.og_image_asset_id === assetId || basics.og_image_asset_id === assetId) {
      add("other_social_image");
    }
  };

  const { live } = args;
  if (live?.logo_asset_id === assetId) add("live_logo");
  if (live?.cover_asset_id === assetId) add("live_cover");
  if (live?.og_image_asset_id === assetId) add("live_social_image");
  if (args.liveSlideAssetIds.includes(assetId)) add("live_slide");

  const data = asRecord(args.draftData);
  const basics = asRecord(data.basics);
  const media = (data.media && typeof data.media === "object" ? data.media : {}) as Record<
    string,
    unknown
  >;
  if (basics.logo_asset_id === assetId) add("draft_logo");
  if (basics.cover_asset_id === assetId) add("draft_cover");
  if (basics.og_image_asset_id === assetId) add("draft_social_image");
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
  for (const other of args.otherLocations ?? []) otherLocationUsages(other.live, other.draftData);
  return usages;
}

function asRecord(value: unknown): Record<string, unknown> {
  return (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
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

const OTHER_LABEL: Record<"logo" | "cover" | "social_image", string> = {
  logo: "logo",
  cover: "cover photo",
  social_image: "link preview image",
};

/**
 * The member-facing reason a delete was refused, or null when the photo
 * isn't used anywhere. Groups by place and says whether it's on the live
 * page, in unpublished changes, or both, e.g.
 * "This photo is used as your cover photo (on your live page) and a
 * carousel slide (in your unpublished changes). Choose a different photo
 * there first, then delete it."
 * Another location's use (one-manager business) is named as such: "This
 * photo is used as the logo of another Hangar 24 location, so it can't be
 * deleted."
 */
export function assetInUseMessage(
  usages: readonly AssetUsage[],
  options: { businessName?: string | null } = {},
): string | null {
  if (usages.length === 0) return null;
  const own = usages.filter((usage) => !usage.startsWith("other_"));
  const otherPlaces = (["logo", "cover", "social_image"] as const)
    .filter((place) => usages.includes(`other_${place}` as AssetUsage))
    .map((place) => OTHER_LABEL[place]);
  const anotherLocation = options.businessName?.trim()
    ? `another ${options.businessName.trim()} location`
    : "another location";
  const otherPhrase = otherPlaces.length ? `the ${joinList(otherPlaces)} of ${anotherLocation}` : null;

  if (own.length === 0) return `This photo is used as ${otherPhrase}, so it can't be deleted.`;

  const places = ["logo", "cover", "social_image", "slide"] as const;
  const parts: string[] = [];
  for (const place of places) {
    const live = own.includes(`live_${place}` as AssetUsage);
    const draft = own.includes(`draft_${place}` as AssetUsage);
    if (!live && !draft) continue;
    const where =
      live && draft
        ? "on your live page and in your unpublished changes"
        : live
          ? "on your live page"
          : "in your unpublished changes";
    parts.push(`${PLACE_LABEL[place]} (${where})`);
  }
  const onlyLive = own.every((usage) => usage.startsWith("live_"));
  const fix = onlyLive
    ? "Choose a different photo there and publish, then delete it."
    : "Choose a different photo there first, then delete it.";
  const also = otherPhrase ? ` It's also ${otherPhrase}.` : "";
  return `This photo is used as ${joinList(parts)}. ${fix}${also}`;
}
