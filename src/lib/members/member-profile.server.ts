import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { notFound } from "@tanstack/react-router";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getOgPlaceholderPath } from "@/lib/media/og-placeholder";
import { getAdjacentInList, type DirectoryEntry } from "@/lib/directory/list-position";
import type { DirectorySort } from "@/lib/directory/search-params";
import type {
  CarouselSlideRow,
  CategoryRow,
  EventRow,
  HoursRow,
  MediaAssetRow,
  MemberLinkRow,
  MemberRow,
  MemberType,
  SpecialHoursRow,
} from "@/lib/supabase/types";

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
  ogImageUrl: string | null;
  siteOrigin: string;
  // A single "now", computed once on the server and serialized as an ISO
  // string, rather than every consumer (MemberProfileTemplate, StatusBlock,
  // EventsModule) independently calling `new Date()`/`Date.now()` during
  // render. Reusing one instant everywhere is what avoids the SSR/hydration
  // mismatch class of bug: the server renders against this exact value, and
  // the client's first render reconstructs the identical Date from the same
  // string instead of reading its own (later, different) clock.
  now: string;
};

type GetMemberProfileInput = {
  slug: string;
  filter?: MemberType;
  sort?: DirectorySort;
};

/**
 * Fetches everything the public profile page needs for one slug, in one
 * server round trip. RLS (anon key, "members: public can read published
 * rows" and the matching child-table policies) is what actually enforces
 * "published only" here -- this function doesn't re-check status itself
 * beyond noticing an empty result.
 */
export const getMemberProfileData = createServerFn({ method: "GET" })
  .inputValidator((data: GetMemberProfileInput) => data)
  .handler(async ({ data }): Promise<MemberProfileData> => {
    const supabase = await getSupabaseServerClient();
    const request = getRequest();
    const siteOrigin = new URL(request.url).origin;
    // Computed once, here, and threaded through the whole response --
    // see MemberProfileData.now's own doc comment.
    const now = new Date();

    const { data: member, error: memberError } = await supabase
      .from("members")
      // Explicit column list, not select("*") -- application_note,
      // dues_received_at, approved_at, and approved_by_user_id are
      // revoked from anon at the column level and must not be requested.
      .select(
        "id, slug, member_type, business_name, tagline, city, state, street_address, postal_code, latitude, longitude, service_area, lead_time, phone, contact_email, timezone, theme, logo_asset_id, cover_asset_id, cover_crop, og_image_asset_id, member_since_year, discount_percent, discount_no_fixed_percent, discount_redeem_text, status, hours_confirmed_at, published_at, trail_eligible, created_at, updated_at",
      )
      .eq("slug", data.slug)
      .maybeSingle();

    // Covers both "no such slug" and "slug exists but the row isn't
    // published" -- RLS already filtered the second case out before this
    // code runs, so both look identical from here: the directory's own
    // 404 (spec, "Slug not found"). The other spec 404 case -- "draft or
    // still an application: 404 to the public, preview banner to its own
    // members" -- is only half-implementable today: there is no member
    // auth yet to show that banner to (Member Admin phase). This
    // function only ever implements the public-404 half.
    if (memberError || !member) {
      throw notFound();
    }

    const typedMember = member as MemberRow;

    const [
      { data: hours },
      { data: specialHours },
      { data: slides },
      { data: links },
      { data: events },
      { data: memberCategories },
    ] = await Promise.all([
      supabase.from("hours").select("*").eq("member_id", typedMember.id),
      supabase.from("special_hours").select("*").eq("member_id", typedMember.id),
      supabase.from("carousel_slides").select("*").eq("member_id", typedMember.id).order("sort_order"),
      supabase.from("member_links").select("*").eq("member_id", typedMember.id).order("sort_order"),
      supabase.from("events").select("*").eq("member_id", typedMember.id).order("starts_at"),
      supabase.from("member_categories").select("category_id").eq("member_id", typedMember.id),
    ]);

    const assetIds = new Set<string>();
    for (const slide of slides ?? []) assetIds.add((slide as CarouselSlideRow).asset_id);
    if (typedMember.logo_asset_id) assetIds.add(typedMember.logo_asset_id);
    if (typedMember.cover_asset_id) assetIds.add(typedMember.cover_asset_id);

    const { data: assets } = assetIds.size
      ? await supabase.from("media_assets").select("*").in("id", Array.from(assetIds))
      : { data: [] as MediaAssetRow[] };
    const assetsById = new Map((assets ?? []).map((asset) => [(asset as MediaAssetRow).id, asset as MediaAssetRow]));

    // "Coming up"/"Where we'll be" only ever shows the future or the
    // happening-right-now (spec's events table has no notion of a
    // past-events view on the public profile) -- filter to events whose
    // EFFECTIVE END is still ahead of `now`, not just their start. A mobile
    // member's only event, at a venue right now (starts_at in the past,
    // ends_at in the future), must not vanish into "No dates announced
    // yet" the instant its start time passes while it's still actively
    // happening. A canceled event is exempt from this date filter entirely
    // and always stays visible even once its original date has passed
    // (spec, "Events": "a canceled event stays visible rather than
    // disappearing") -- a rescheduled-then-canceled event, or one canceled
    // after the fact, would otherwise have no future date at all and get
    // swept up here.
    //
    // When an event has been rescheduled (overlay_starts_at set), there is
    // no overlay_ends_at column to derive a new end time from, so the
    // effective end falls back to the rescheduled start itself rather than
    // reusing the ORIGINAL event's ends_at -- the original ends_at could be
    // an unrelated, already-passed time from before the reschedule, which
    // would incorrectly filter the event out even though it's still
    // upcoming at its new time.
    //
    // is_hidden filtering is NOT done here -- it happens twice, on
    // purpose, in defense of depth: the public RLS policy on `events`
    // (migration 20260922153458_final_review_fixes.sql, section 2) already
    // adds `and not events.is_hidden`, so a hidden event never reaches
    // this anon-key query result in the first place; application code
    // (EventsModule's own filter, and MemberProfileTemplate's
    // nextEvent/tonightEvent computation) re-filters it too, so the public
    // profile is still correct even if that RLS predicate were ever
    // dropped from a future migration.
    const upcomingOrCanceledEvents = (events ?? []).filter((row) => {
      const event = row as EventRow;
      if (event.overlay_status === "canceled") return true;
      const effectiveEnd = event.overlay_starts_at
        ? new Date(event.overlay_starts_at).getTime()
        : new Date(event.ends_at ?? event.starts_at).getTime();
      return effectiveEnd >= now.getTime();
    });

    const categoryIds = (memberCategories ?? []).map((row) => row.category_id as string);
    const { data: categories } = categoryIds.length
      ? await supabase.from("categories").select("*").in("id", categoryIds).order("sort_order")
      : { data: [] as CategoryRow[] };

    const logoAsset = typedMember.logo_asset_id ? assetsById.get(typedMember.logo_asset_id) ?? null : null;
    const coverAsset = typedMember.cover_asset_id ? assetsById.get(typedMember.cover_asset_id) ?? null : null;

    const logoPublicUrl = logoAsset
      ? supabase.storage.from("member-logos").getPublicUrl(logoAsset.storage_path).data.publicUrl
      : null;

    // The member's own explicit choice always wins; otherwise a branded,
    // member-type-specific placeholder (not the cover/logo/site-generic
    // chain this used to fall through -- see this plan's own design notes
    // for why: a link preview should never look identical to the
    // homepage's). The placeholder is served raw, same as the explicit
    // asset branch -- social crawlers fetch this URL directly and never
    // apply any crop.
    const ogImageUrl = typedMember.og_image_asset_id
      ? `${siteOrigin}/api/member-media/${typedMember.og_image_asset_id}`
      : `${siteOrigin}${getOgPlaceholderPath(typedMember.member_type)}`;

    // Header prev/next: the visitor's own browsing order (spec, "Next in
    // the directory, not nearest"). If the visitor's filter doesn't
    // actually match this member (e.g. a shared link with a stale or
    // mismatched filter), fall back to the unfiltered default order
    // rather than silently excluding the member they're looking at.
    const effectiveFilter = data.filter === typedMember.member_type ? data.filter : undefined;
    let directoryQuery = supabase
      .from("members")
      .select("id, slug, business_name, city, member_type")
      .eq("status", "published")
      .order("business_name");
    if (effectiveFilter) {
      directoryQuery = directoryQuery.eq("member_type", effectiveFilter);
    }
    const { data: directoryRows } = await directoryQuery;
    const directoryEntries: DirectoryEntry[] = (directoryRows ?? []).map((row) => ({
      id: row.id as string,
      slug: row.slug as string,
      businessName: row.business_name as string,
      city: row.city as string,
      memberType: row.member_type as MemberType,
    }));
    const { prev: headerPrev, next: headerNext } = getAdjacentInList(directoryEntries, typedMember.id);

    // Cross-link card: always scoped to this member's own type, regardless
    // of how the visitor arrived (spec: producers point at another
    // producer, mobile members at another mobile member, Allied Members
    // at another Allied Member).
    const { data: sameTypeRows } = await supabase
      .from("members")
      .select("id, slug, business_name, city, member_type")
      .eq("status", "published")
      .eq("member_type", typedMember.member_type)
      .order("business_name");
    const sameTypeEntries: DirectoryEntry[] = (sameTypeRows ?? []).map((row) => ({
      id: row.id as string,
      slug: row.slug as string,
      businessName: row.business_name as string,
      city: row.city as string,
      memberType: row.member_type as MemberType,
    }));
    const crossLink = getAdjacentInList(sameTypeEntries, typedMember.id).next;

    return {
      member: typedMember,
      hours: (hours ?? []) as HoursRow[],
      specialHours: (specialHours ?? []) as SpecialHoursRow[],
      carouselSlides: (slides ?? [])
        .map((slide) => {
          const typedSlide = slide as CarouselSlideRow;
          const asset = assetsById.get(typedSlide.asset_id);
          // carousel_slides' public-read policy only requires the parent
          // member be published; media_assets' public-read policy ALSO
          // requires review_status = 'approved'. A slide can therefore be
          // readable while the asset it points at is not (moderated to
          // pending/rejected), in which case assetsById.get() returns
          // undefined here. Drop that slide rather than casting through
          // the undefined -- MediaCarousel reads slide.asset.id
          // unconditionally and would throw, turning this into an SSR 500
          // for every visitor of that member's profile.
          return asset ? { ...typedSlide, asset } : null;
        })
        .filter((slide): slide is CarouselSlideRow & { asset: MediaAssetRow } => slide !== null),
      links: (links ?? []) as MemberLinkRow[],
      events: upcomingOrCanceledEvents as EventRow[],
      categories: (categories ?? []) as CategoryRow[],
      logoAsset,
      coverAsset,
      logoPublicUrl,
      crossLink,
      headerPrev,
      headerNext,
      ogImageUrl,
      siteOrigin,
      now: now.toISOString(),
    };
  });
