import type { PlaceProfile } from "@/lib/google/place-profile";
import type { MemberProfileData } from "@/lib/members/profile-object";
import type { MemberRow, MemberType } from "@/lib/supabase/types";

/**
 * The profile a prospective member sees on /join before they submit: the
 * typed name and city, plus whatever Google knew. Pure -- no I/O. It has no
 * photos at all (nothing is uploaded yet), so the template never tries to
 * load an asset by id. Rows get synthetic ids, like the draft preview.
 */
export function buildJoinPreviewProfile(input: {
  businessName: string;
  city: string;
  memberType: MemberType;
  profile: PlaceProfile | null;
  siteOrigin: string;
  now: Date;
}): MemberProfileData {
  const { businessName, city, memberType, profile, siteOrigin, now } = input;

  const member: MemberRow = {
    id: "join-preview",
    slug: "join-preview",
    member_type: memberType,
    business_name: businessName,
    business_id: null,
    tagline: profile?.tagline ?? null,
    city: profile?.city || city,
    state: profile?.state || "CA",
    street_address: profile?.street_address ?? null,
    postal_code: profile?.postal_code ?? null,
    latitude: profile?.latitude ?? null,
    longitude: profile?.longitude ?? null,
    service_area: null,
    lead_time: null,
    phone: profile?.phone ?? null,
    contact_email: null,
    timezone: "America/Los_Angeles",
    theme: "amber",
    logo_asset_id: null,
    logo_background: "theme",
    cover_asset_id: null,
    cover_crop: null,
    og_image_asset_id: null,
    member_since_year: null,
    discount_percent: null,
    discount_no_fixed_percent: false,
    discount_redeem_text: null,
    status: "applied",
    hours_confirmed_at: null,
    published_at: null,
    trail_eligible: false,
  };

  return {
    member,
    hours: (profile?.hours ?? []).map((h, i) => ({ id: `join-hours-${i}`, member_id: member.id, ...h })),
    specialHours: [],
    carouselSlides: [],
    links: profile?.website
      ? [{ id: "join-link-0", member_id: member.id, kind: "website", label: null, url: profile.website, sort_order: 0 }]
      : [],
    events: [],
    foodSlots: [],
    guestFoodSlots: [],
    hasFoodCalendar: false,
    hasGuestFood: false,
    categories: [],
    logoAsset: null,
    coverAsset: null,
    logoPublicUrl: null,
    crossLink: null,
    headerPrev: null,
    headerNext: null,
    headerPosition: null,
    crossLinkLogoUrl: null,
    crossLinkLogoBackground: null,
    nextLocation: null,
    ogImageUrl: null,
    siteOrigin,
    now: now.toISOString(),
    isPreview: true,
    isImpersonatedPreview: false,
    isImpersonatingThisMember: false,
    viewerIsEditor: false,
  };
}
