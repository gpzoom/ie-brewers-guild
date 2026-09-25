import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { notFound } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { readImpersonationState } from "@/lib/guild/impersonation.server";
import { getAdjacentInList, type DirectoryEntry } from "@/lib/directory/list-position";
import type { DirectorySort } from "@/lib/directory/search-params";
import { logoBackgroundColor } from "@/lib/members/logo-background";
import {
  applyDraftSections,
  buildProfileObject,
  referencedAssetIds,
  type MemberProfileData,
  type ProfileRows,
} from "@/lib/members/profile-object";
import { loadMemberDraftBundle } from "@/lib/drafts/drafts.server";
import { DRAFT_SECTIONS, isFullEditor, type DraftSection } from "@/lib/drafts/sections";
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
  ThemeName,
} from "@/lib/supabase/types";

export type { MemberProfileData } from "@/lib/members/profile-object";

/**
 * Loaders that fill the profile object (src/lib/members/profile-object.ts)
 * for MemberProfileTemplate: getMemberProfileData for the live
 * /members/$slug page, getMemberPreviewData for /admin/preview (the draft).
 * The shaping itself is the pure buildProfileObject; everything here is
 * reading rows.
 */

// Explicit column list, not select("*") -- application_note,
// dues_received_at, approved_at and approved_by_user_id are revoked from
// anon at the column level, and Postgres expands "*" to every column before
// checking permission, so "*" would break anon's published-row reads.
const MEMBER_COLUMNS =
  "id, slug, member_type, business_name, tagline, city, state, street_address, postal_code, latitude, longitude, service_area, lead_time, phone, contact_email, timezone, theme, logo_asset_id, logo_background, cover_asset_id, cover_crop, og_image_asset_id, member_since_year, discount_percent, discount_no_fixed_percent, discount_redeem_text, status, hours_confirmed_at, published_at, trail_eligible, created_at, updated_at";

function toEntries(rows: unknown[] | null): DirectoryEntry[] {
  return (rows ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      id: row.id as string,
      slug: row.slug as string,
      businessName: row.business_name as string,
      city: row.city as string,
      memberType: row.member_type as MemberType,
    };
  });
}

async function readLiveRows(supabase: SupabaseClient, member: MemberRow): Promise<ProfileRows> {
  const [
    { data: hours },
    { data: specialHours },
    { data: slides },
    { data: links },
    { data: memberCategories },
  ] = await Promise.all([
    supabase.from("hours").select("*").eq("member_id", member.id),
    supabase.from("special_hours").select("*").eq("member_id", member.id),
    supabase.from("carousel_slides").select("*").eq("member_id", member.id).order("sort_order"),
    supabase.from("member_links").select("*").eq("member_id", member.id).order("sort_order"),
    supabase.from("member_categories").select("category_id").eq("member_id", member.id),
  ]);
  return {
    member,
    hours: (hours ?? []) as HoursRow[],
    specialHours: (specialHours ?? []) as SpecialHoursRow[],
    slides: (slides ?? []) as CarouselSlideRow[],
    links: (links ?? []) as MemberLinkRow[],
    categoryIds: (memberCategories ?? []).map((row) => row.category_id as string),
  };
}

/**
 * Everything around the member's own rows: their photos, events,
 * categories, and the directory neighbours for the header and cross-link.
 * Returns the finished profile object.
 */
async function assembleProfile(args: {
  supabase: SupabaseClient;
  rows: ProfileRows;
  filter?: MemberType;
  siteOrigin: string;
  now: Date;
  flags: Pick<
    MemberProfileData,
    "isPreview" | "isImpersonatedPreview" | "isImpersonatingThisMember" | "viewerIsEditor"
  >;
}): Promise<MemberProfileData> {
  const { supabase, rows } = args;
  const member = rows.member;
  const assetIds = referencedAssetIds(rows);

  // Header prev/next follow the visitor's own browsing order (spec, "Next
  // in the directory, not nearest"). A filter that doesn't match this
  // member (a stale shared link) falls back to the unfiltered order.
  const effectiveFilter = args.filter === member.member_type ? args.filter : undefined;
  let directoryQuery = supabase
    .from("members")
    .select("id, slug, business_name, city, member_type")
    .eq("status", "published")
    .order("business_name");
  if (effectiveFilter) directoryQuery = directoryQuery.eq("member_type", effectiveFilter);

  const [
    assetsResult,
    eventsResult,
    categoriesResult,
    directoryResult,
    sameTypeResult,
    siblingResult,
  ] = await Promise.all([
    assetIds.length
      ? supabase.from("media_assets").select("*").in("id", assetIds)
      : Promise.resolve({ data: [] as MediaAssetRow[] }),
    supabase.from("events").select("*").eq("member_id", member.id).order("starts_at"),
    rows.categoryIds.length
      ? supabase.from("categories").select("*").in("id", rows.categoryIds).order("sort_order")
      : Promise.resolve({ data: [] as CategoryRow[] }),
    directoryQuery,
    // Cross-link card: always this member's own type, however the visitor arrived.
    supabase
      .from("members")
      .select("id, slug, business_name, city, member_type, logo_asset_id, logo_background, theme")
      .eq("status", "published")
      .eq("member_type", member.member_type)
      .order("business_name"),
    // Next location: this business's other published rows (business_name is
    // the only thing tying sibling locations together), by city.
    supabase
      .from("members")
      .select("id, slug, business_name, city, member_type")
      .eq("status", "published")
      .eq("business_name", member.business_name)
      .order("city"),
  ]);

  const assets = (assetsResult.data ?? []) as MediaAssetRow[];
  const logoAsset = member.logo_asset_id
    ? assets.find((a) => a.id === member.logo_asset_id)
    : undefined;
  const logoPublicUrl = logoAsset
    ? supabase.storage.from("member-logos").getPublicUrl(logoAsset.storage_path).data.publicUrl
    : null;

  const sameTypeRows = (sameTypeResult.data ?? []) as Array<Record<string, unknown>>;
  const sameTypeEntries = toEntries(sameTypeRows);
  const crossLink = getAdjacentInList(sameTypeEntries, member.id).next;
  const crossLinkRow = crossLink ? sameTypeRows.find((row) => row.id === crossLink.id) : undefined;
  const crossLinkLogoBackground = crossLinkRow
    ? logoBackgroundColor(
        crossLinkRow.logo_background as string | null,
        crossLinkRow.theme as ThemeName,
      )
    : null;
  let crossLinkLogoUrl: string | null = null;
  const crossLinkLogoAssetId = crossLinkRow?.logo_asset_id as string | null | undefined;
  if (crossLinkLogoAssetId) {
    // media_assets' own RLS still decides whether it's readable (approved only, for anon).
    const { data: crossLinkLogo } = await supabase
      .from("media_assets")
      .select("storage_path")
      .eq("id", crossLinkLogoAssetId)
      .maybeSingle();
    if (crossLinkLogo?.storage_path) {
      crossLinkLogoUrl = supabase.storage
        .from("member-logos")
        .getPublicUrl(crossLinkLogo.storage_path as string).data.publicUrl;
    }
  }

  return buildProfileObject({
    rows,
    assets,
    events: (eventsResult.data ?? []) as EventRow[],
    categories: (categoriesResult.data ?? []) as CategoryRow[],
    logoPublicUrl,
    directoryEntries: toEntries(directoryResult.data),
    sameTypeEntries,
    siblingEntries: toEntries(siblingResult.data),
    crossLinkLogoUrl,
    crossLinkLogoBackground,
    siteOrigin: args.siteOrigin,
    now: args.now,
    flags: args.flags,
  });
}

type GetMemberProfileInput = {
  slug: string;
  filter?: MemberType;
  sort?: DirectorySort;
};

/**
 * The live public profile for one slug, in one server round trip. RLS
 * (anon key, "members: public can read published rows" and the matching
 * child-table policies) is what enforces "published only" -- this doesn't
 * re-check status beyond noticing an empty result.
 */
export const getMemberProfileData = createServerFn({ method: "GET" })
  .inputValidator((data: GetMemberProfileInput) => data)
  .handler(async ({ data }): Promise<MemberProfileData> => {
    // The session-bound client whenever a session exists at all, so a
    // signed-in member (or an impersonating Guild admin) looking at an
    // unpublished profile gets through RLS's owner/Guild-admin select
    // policies. Anyone else still gets nothing back -- RLS decides.
    const sessionClient = await getSupabaseServerClientForRequest();
    const { data: sessionUser } = await sessionClient.auth.getUser();
    const supabase = sessionUser?.user ? sessionClient : await getSupabaseServerClient();
    const siteOrigin = new URL(getRequest().url).origin;
    const now = new Date();

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select(MEMBER_COLUMNS)
      .eq("slug", data.slug)
      .maybeSingle();

    // "No such slug", "not published and the viewer can't see it", and any
    // other RLS denial all look the same: the directory's own 404.
    if (memberError || !member) {
      throw notFound();
    }

    const typedMember = member as unknown as MemberRow;
    const isPreview = typedMember.status !== "published";
    // Checked for published profiles too, so whoever can edit this profile
    // always gets a "Back to editing" way out of the public page.
    const impersonation = sessionUser?.user ? await readImpersonationState() : null;
    const isImpersonatingThisMember = Boolean(
      impersonation && impersonation.memberId === typedMember.id,
    );
    let viewerIsEditor = false;
    if (sessionUser?.user && !isImpersonatingThisMember) {
      // "member_users: users can read their own links" -- a hit means they edit this member.
      const { data: link } = await sessionClient
        .from("member_users")
        .select("member_id")
        .eq("member_id", typedMember.id)
        .eq("user_id", sessionUser.user.id)
        .limit(1)
        .maybeSingle();
      viewerIsEditor = Boolean(link);
    }

    const rows = await readLiveRows(supabase, typedMember);
    return assembleProfile({
      supabase,
      rows,
      filter: data.filter,
      siteOrigin,
      now,
      flags: {
        isPreview,
        isImpersonatedPreview: isPreview && isImpersonatingThisMember,
        isImpersonatingThisMember,
        viewerIsEditor,
      },
    });
  });

export type MemberPreviewData = {
  profile: MemberProfileData;
  /** Which draft sections the preview applied (all, or just media for a Photos & events editor). */
  appliedSections: DraftSection[];
  isPublished: boolean;
};

/**
 * The draft rendered through the same template, for /admin/preview (spec,
 * "Drafts": "Preview renders the real profile template from the draft").
 * An owner, full editor or Guild admin sees the whole draft; a Photos &
 * events editor sees the live page with only their media draft applied,
 * because that's exactly what their Publish would put live.
 *
 * Everything is read through the signed-in session client: the member's
 * own rows (published or not), their draft, and their photos. The template
 * is rendered with mediaMode="preview", so the cover and slides load
 * through /api/admin-media (ownership check), not the public route.
 */
export const getMemberPreviewData = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }): Promise<MemberPreviewData> => {
    const supabase = await getSupabaseServerClientForRequest();
    const siteOrigin = new URL(getRequest().url).origin;
    const now = new Date();

    const bundle = await loadMemberDraftBundle(supabase, data.memberId);
    const { data: member, error } = await supabase
      .from("members")
      .select(MEMBER_COLUMNS)
      .eq("id", data.memberId)
      .maybeSingle();
    if (error || !member) throw notFound();
    const liveMember = member as unknown as MemberRow;

    const appliedSections: DraftSection[] = isFullEditor(bundle.role)
      ? [...DRAFT_SECTIONS]
      : ["media"];
    const liveRows = await readLiveRows(supabase, liveMember);
    const rows = applyDraftSections(liveRows, bundle.data, appliedSections);

    const profile = await assembleProfile({
      supabase,
      rows,
      siteOrigin,
      now,
      flags: {
        isPreview: true,
        isImpersonatedPreview: false,
        isImpersonatingThisMember: false,
        viewerIsEditor: true,
      },
    });
    return { profile, appliedSections, isPublished: liveMember.status === "published" };
  });
