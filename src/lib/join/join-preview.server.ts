import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { resolveEmailSiteUrl } from "@/lib/email/build-email-content";
import { mapPlaceToProfile, type PlaceProfile } from "@/lib/google/place-profile";
import { getPlaceDetails } from "@/lib/google/places-client.server";
import { buildJoinPreviewProfile } from "@/lib/join/join-preview";
import { collapse, rateLimitMessage } from "@/lib/join/join-guards.server";
import type { MemberProfileData } from "@/lib/members/profile-object";
import type { MemberType } from "@/lib/supabase/types";

/**
 * The /join page's instant preview (public, no account). Nothing from the
 * browser is trusted: only the place id is taken, and Google's details are
 * re-fetched here. If Google isn't available (no key, an error), the
 * preview is built from the typed fields alone rather than failing.
 *
 * Shares the `join-search` rate-limit key with joinSearchPlaces. A limited
 * request throws an Error whose message is safe to show as-is.
 */
const MEMBER_TYPES: readonly MemberType[] = ["producer", "mobile", "allied"];
const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,300}$/;

export const getJoinPreview = createServerFn({ method: "POST" })
  .inputValidator((data: { businessName: string; city: string; memberType: MemberType; placeId: string | null }) => data)
  .handler(async ({ data }): Promise<MemberProfileData> => {
    const limited = await rateLimitMessage("join-search");
    if (limited) throw new Error(limited);

    const businessName = collapse(data?.businessName).slice(0, 200);
    const city = collapse(data?.city).slice(0, 100);
    if (!businessName) throw new Error("Enter your business name.");
    if (!MEMBER_TYPES.includes(data?.memberType)) throw new Error("Choose a member type.");
    const memberType = data.memberType;

    // Mobile never uses Google.
    let profile: PlaceProfile | null = null;
    const placeId = typeof data.placeId === "string" ? data.placeId.trim() : "";
    if (memberType !== "mobile" && PLACE_ID_PATTERN.test(placeId)) {
      try {
        profile = mapPlaceToProfile(await getPlaceDetails(placeId));
      } catch (err) {
        console.error("getJoinPreview: Google details failed", err instanceof Error ? err.message : String(err));
        profile = null;
      }
    }

    let requestUrl: string | null = null;
    try {
      requestUrl = getRequest().url;
    } catch {
      requestUrl = null;
    }

    return buildJoinPreviewProfile({
      businessName,
      city,
      memberType,
      profile,
      siteOrigin: resolveEmailSiteUrl(requestUrl),
      now: new Date(),
    });
  });
