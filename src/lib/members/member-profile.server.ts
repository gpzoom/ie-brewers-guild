import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { notFound } from "@tanstack/react-router";
import { getSupabaseServerClient } from "@/lib/supabase/server";
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

    const { data: member, error: memberError } = await supabase
      .from("members")
      // Explicit column list, not select("*") -- application_note,
      // dues_received_at, approved_at, and approved_by_user_id are
      // revoked from anon at the column level and must not be requested.
      .select(
        "id, slug, member_type, business_name, tagline, city, state, street_address, postal_code, latitude, longitude, service_area, lead_time, phone, contact_email, timezone, theme, logo_asset_id, cover_asset_id, cover_crop, member_since_year, discount_percent, discount_no_fixed_percent, discount_redeem_text, status, hours_confirmed_at, published_at, trail_eligible, created_at, updated_at",
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

    const categoryIds = (memberCategories ?? []).map((row) => row.category_id as string);
    const { data: categories } = categoryIds.length
      ? await supabase.from("categories").select("*").in("id", categoryIds).order("sort_order")
      : { data: [] as CategoryRow[] };

    const logoAsset = typedMember.logo_asset_id ? assetsById.get(typedMember.logo_asset_id) ?? null : null;
    const coverAsset = typedMember.cover_asset_id ? assetsById.get(typedMember.cover_asset_id) ?? null : null;

    const logoPublicUrl = logoAsset
      ? supabase.storage.from("member-logos").getPublicUrl(logoAsset.storage_path).data.publicUrl
      : null;

    const coverAssetIsMediaBucket = Boolean(coverAsset);
    const ogImageUrl = coverAssetIsMediaBucket
      ? `${siteOrigin}/api/member-media/${coverAsset!.id}`
      : logoPublicUrl;

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
      carouselSlides: (slides ?? []).map((slide) => ({
        ...(slide as CarouselSlideRow),
        asset: assetsById.get((slide as CarouselSlideRow).asset_id) as MediaAssetRow,
      })),
      links: (links ?? []) as MemberLinkRow[],
      events: (events ?? []) as EventRow[],
      categories: (categories ?? []) as CategoryRow[],
      logoAsset,
      coverAsset,
      logoPublicUrl,
      crossLink,
      headerPrev,
      headerNext,
      ogImageUrl,
      siteOrigin,
    };
  });
