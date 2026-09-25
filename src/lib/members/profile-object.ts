import { getAdjacentInList, type DirectoryEntry } from "@/lib/directory/list-position";
import { getOgPlaceholderPath } from "@/lib/media/og-placeholder";
import type { DraftSection, MemberDraftData } from "@/lib/drafts/sections";
import type {
  CarouselSlideRow,
  CategoryRow,
  EventRow,
  HoursRow,
  MediaAssetRow,
  MemberLinkRow,
  MemberRow,
  SpecialHoursRow,
} from "@/lib/supabase/types";

/**
 * Where MemberProfileTemplate loads the cover and carousel photos from.
 * "live": the public /api/member-media route, which only serves photos a
 * published profile uses. "preview": /api/admin-media, which serves any
 * photo in the signed-in member's own gallery -- needed for the draft
 * preview (and an unpublished page), whose photos aren't public yet.
 */
export type ProfileMediaMode = "live" | "preview";

/**
 * The profile template's single input (plan phase 2, "Profile template").
 * MemberProfileTemplate and its children render purely from this object;
 * the live page and the draft preview only differ in how it's filled
 * (src/lib/members/member-profile.server.ts) and in where the template
 * loads cover/carousel photos from (its `mediaMode` prop).
 */
export type MemberProfileData = {
  member: MemberRow;
  hours: HoursRow[];
  specialHours: SpecialHoursRow[];
  carouselSlides: (CarouselSlideRow & { asset: MediaAssetRow })[];
  links: MemberLinkRow[];
  events: EventRow[];
  categories: CategoryRow[];
  logoAsset: MediaAssetRow | null;
  coverAsset: MediaAssetRow | null;
  logoPublicUrl: string | null;
  crossLink: DirectoryEntry | null;
  headerPrev: DirectoryEntry | null;
  headerNext: DirectoryEntry | null;
  // This member's 1-based place in the same browsing order headerPrev/
  // headerNext walk ("7 / 24" in the header, artboards D/L). Null when the
  // member isn't in that list (e.g. an unpublished preview).
  headerPosition: { index: number; total: number } | null;
  // The cross-link card's own logo (public member-logos URL), or null.
  crossLinkLogoUrl: string | null;
  // The cross-link member's own logo tile color (their logo_background).
  crossLinkLogoBackground: string | null;
  // The next of this SAME business's other published locations (by
  // business_name), not the next member in the visitor's browsing order.
  // Null for a single-location business, or when this business's other
  // locations aren't published yet.
  nextLocation: DirectoryEntry | null;
  ogImageUrl: string | null;
  siteOrigin: string;
  // A single "now", computed once on the server and serialized as an ISO
  // string, rather than every consumer independently calling `new Date()`
  // during render -- the server renders against this exact value and the
  // client's first render reconstructs the identical Date, avoiding the
  // SSR/hydration mismatch class of bug.
  now: string;
  // True when the member row isn't published -- the viewer only sees it
  // because RLS's owner/Guild-admin policies let them through. Drives the
  // public page's ProfilePreviewBanner.
  isPreview: boolean;
  // True when the viewer is a Guild admin impersonating THIS member and
  // the row isn't published.
  isImpersonatedPreview: boolean;
  // True when a Guild admin is impersonating THIS member, published or not.
  isImpersonatingThisMember: boolean;
  // True when the signed-in viewer is one of this member's own linked
  // users (published or not). False while impersonating.
  viewerIsEditor: boolean;
};

/** The member's own rows, before assets/events/directory are attached. */
export type ProfileRows = {
  member: MemberRow;
  hours: HoursRow[];
  specialHours: SpecialHoursRow[];
  slides: CarouselSlideRow[];
  links: MemberLinkRow[];
  categoryIds: string[];
};

/**
 * Lays the named draft sections over the live rows -- what the preview
 * renders. The whole draft for an owner/full editor (every section); for a
 * Photos & events editor only `media`, because that's exactly what their
 * Publish would put live (spec, "Publishing by section"). Draft list rows
 * get synthetic ids; nothing downstream keys on real row ids.
 */
export function applyDraftSections(
  rows: ProfileRows,
  draft: MemberDraftData,
  sections: readonly DraftSection[],
): ProfileRows {
  const memberId = rows.member.id;
  const next: ProfileRows = { ...rows, member: { ...rows.member } };

  if (sections.includes("basics")) {
    const b = draft.basics;
    next.member = {
      ...next.member,
      business_name: b.business_name,
      tagline: b.tagline,
      city: b.city,
      state: b.state,
      street_address: b.street_address,
      service_area: b.service_area,
      lead_time: b.lead_time,
      member_since_year: b.member_since_year,
      timezone: b.timezone,
      phone: b.phone,
      contact_email: b.contact_email,
      logo_asset_id: b.logo_asset_id,
      logo_background: b.logo_background,
      cover_asset_id: b.cover_asset_id,
      cover_crop: b.cover_crop,
      og_image_asset_id: b.og_image_asset_id,
    };
    next.hours = b.hours.map((h, i) => ({ id: `draft-hours-${i}`, member_id: memberId, ...h }));
    next.specialHours = b.special_hours.map((s, i) => ({
      id: `draft-special-${i}`,
      member_id: memberId,
      ...s,
    }));
  }
  if (sections.includes("media")) {
    next.slides = draft.media.slides.map((s) => ({
      id: `draft-slide-${s.sort_order}`,
      member_id: memberId,
      asset_id: s.asset_id,
      crop: s.crop,
      outbound_url: s.outbound_url,
      sort_order: s.sort_order,
    }));
  }
  if (sections.includes("links")) {
    // Same order publish_member_draft gives them: by sort_order, missing
    // ones last, ties by position.
    next.links = draft.links.links
      .map((l, index) => ({ l, index }))
      .sort((a, b) => {
        const ao = a.l.sort_order ?? Number.POSITIVE_INFINITY;
        const bo = b.l.sort_order ?? Number.POSITIVE_INFINITY;
        return ao === bo ? a.index - b.index : ao - bo;
      })
      .map(({ l }, i) => ({
        id: `draft-link-${i}`,
        member_id: memberId,
        kind: l.kind,
        label: l.label,
        url: l.url,
        sort_order: i,
      }));
  }
  if (sections.includes("discount")) {
    next.member = {
      ...next.member,
      discount_percent: draft.discount.discount_percent,
      discount_no_fixed_percent: draft.discount.discount_no_fixed_percent,
      discount_redeem_text: draft.discount.discount_redeem_text,
    };
    next.categoryIds = [...draft.discount.category_ids];
  }
  if (sections.includes("theme")) {
    next.member = { ...next.member, theme: draft.theme.theme };
  }
  return next;
}

/** Every photo the rows point at (logo, cover, slides) -- what the loader fetches. */
export function referencedAssetIds(rows: ProfileRows): string[] {
  const ids = new Set<string>();
  for (const slide of rows.slides) ids.add(slide.asset_id);
  if (rows.member.logo_asset_id) ids.add(rows.member.logo_asset_id);
  if (rows.member.cover_asset_id) ids.add(rows.member.cover_asset_id);
  return [...ids];
}

/**
 * "Coming up"/"Where we'll be" only ever shows the future or the
 * happening-right-now: events whose EFFECTIVE END is still ahead of `now`.
 * A canceled event always stays visible (spec, "Events": "a canceled event
 * stays visible rather than disappearing"). A rescheduled event has no
 * overlay end time, so its effective end is the new start. Hidden events
 * are left for the template to filter (and RLS already drops them for
 * anon).
 */
export function upcomingOrCanceledEvents(events: EventRow[], now: Date): EventRow[] {
  return events.filter((event) => {
    if (event.overlay_status === "canceled") return true;
    const effectiveEnd = event.overlay_starts_at
      ? new Date(event.overlay_starts_at).getTime()
      : new Date(event.ends_at ?? event.starts_at).getTime();
    return effectiveEnd >= now.getTime();
  });
}

export type BuildProfileInput = {
  rows: ProfileRows;
  /** media_assets rows the caller could read, keyed by id. */
  assets: MediaAssetRow[];
  events: EventRow[];
  categories: CategoryRow[];
  logoPublicUrl: string | null;
  /** Published members in the visitor's browsing order (already filtered). */
  directoryEntries: DirectoryEntry[];
  /** Published members of the same type, by name (for the cross-link card). */
  sameTypeEntries: DirectoryEntry[];
  /** Published rows with the same business_name, by city. */
  siblingEntries: DirectoryEntry[];
  crossLinkLogoUrl: string | null;
  crossLinkLogoBackground: string | null;
  siteOrigin: string;
  now: Date;
  flags: {
    isPreview: boolean;
    isImpersonatedPreview: boolean;
    isImpersonatingThisMember: boolean;
    viewerIsEditor: boolean;
  };
};

/** Pure assembly of the template's input from rows the loader already read. */
export function buildProfileObject(input: BuildProfileInput): MemberProfileData {
  const { rows, now, siteOrigin } = input;
  const member = rows.member;
  const assetsById = new Map(input.assets.map((asset) => [asset.id, asset]));

  const { prev: headerPrev, next: headerNext } = getAdjacentInList(
    input.directoryEntries,
    member.id,
  );
  const positionIndex = input.directoryEntries.findIndex((entry) => entry.id === member.id);
  const headerPosition =
    positionIndex === -1
      ? null
      : { index: positionIndex + 1, total: input.directoryEntries.length };

  // The member's own explicit choice always wins; otherwise a branded,
  // member-type-specific placeholder. Social crawlers fetch this URL
  // directly and never apply a crop.
  const ogImageUrl = member.og_image_asset_id
    ? `${siteOrigin}/api/member-media/${member.og_image_asset_id}`
    : `${siteOrigin}${getOgPlaceholderPath(member.member_type)}`;

  return {
    member,
    hours: rows.hours,
    specialHours: rows.specialHours,
    carouselSlides: [...rows.slides]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((slide) => {
        // A slide can be readable while its asset isn't (moderated to
        // pending/rejected, or -- in a preview -- not approved yet). Drop
        // it rather than hand MediaCarousel an undefined asset, which would
        // throw during SSR.
        const asset = assetsById.get(slide.asset_id);
        return asset ? { ...slide, asset } : null;
      })
      .filter((slide): slide is CarouselSlideRow & { asset: MediaAssetRow } => slide !== null),
    links: [...rows.links].sort((a, b) => a.sort_order - b.sort_order),
    events: upcomingOrCanceledEvents(input.events, now),
    categories: input.categories,
    logoAsset: member.logo_asset_id ? (assetsById.get(member.logo_asset_id) ?? null) : null,
    coverAsset: member.cover_asset_id ? (assetsById.get(member.cover_asset_id) ?? null) : null,
    logoPublicUrl: input.logoPublicUrl,
    crossLink: getAdjacentInList(input.sameTypeEntries, member.id).next,
    headerPrev,
    headerNext,
    headerPosition,
    crossLinkLogoUrl: input.crossLinkLogoUrl,
    crossLinkLogoBackground: input.crossLinkLogoBackground,
    nextLocation: getAdjacentInList(input.siblingEntries, member.id).next,
    ogImageUrl,
    siteOrigin,
    now: now.toISOString(),
    ...input.flags,
  };
}
