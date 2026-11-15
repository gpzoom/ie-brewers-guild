import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { resolveEmailSiteUrl } from "@/lib/email/build-email-content";
import { mapPlaceToProfile, type PlaceProfile } from "@/lib/google/place-profile";
import { getPlaceDetails } from "@/lib/google/places-client.server";
import { currentRequestUrl } from "@/lib/request-url.server";
import { buildJoinPreviewProfile } from "@/lib/join/join-preview";
import { JOIN_CLOSED, collapse, isJoinOpen, rateLimitMessage } from "@/lib/join/join-guards.server";
import { CHOOSE_MEMBER_TYPE, ENTER_BUSINESS_NAME } from "@/lib/join/join-messages";
import { citiesToCheck, isAlreadyMemberForPreview } from "@/lib/join/duplicate-check";
import { loadRosterCandidates } from "@/lib/join/duplicate-check.server";
import type { MemberProfileData } from "@/lib/members/profile-object";
import type { MemberType } from "@/lib/supabase/types";

/**
 * The /join page's instant preview (public, no account). Nothing from the
 * browser is trusted: only the place id is taken, and Google's details are
 * re-fetched here. If Google isn't available (no key, an error), the
 * preview is built from the typed fields alone rather than failing. A
 * permanently closed place counts as no Google data.
 *
 * The already-a-member check runs first (spec §3), against the typed city
 * and Google's, with no email: a match answers { kind: "already-member" }
 * and no preview is built. (A pending Join application is left to the
 * submit, which knows the email -- see isAlreadyMemberForPreview.)
 *
 * Refuses with JOIN_CLOSED unless Join is open (ruling R11). Shares the
 * `join-search` rate-limit key with joinSearchPlaces. A refused request
 * throws an Error whose message is safe to show as-is (join-messages.ts).
 */
const MEMBER_TYPES: readonly MemberType[] = ["producer", "mobile", "allied"];
const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,300}$/;

export type JoinPreviewResult = { kind: "preview"; data: MemberProfileData } | { kind: "already-member" };

export const getJoinPreview = createServerFn({ method: "POST" })
  .inputValidator((data: { businessName: string; city: string; memberType: MemberType; placeId: string | null }) => data)
  .handler(async ({ data }): Promise<JoinPreviewResult> => {
    if (!(await isJoinOpen())) throw new Error(JOIN_CLOSED);
    const limited = await rateLimitMessage("join-search");
    if (limited) throw new Error(limited);

    const businessName = collapse(data?.businessName).slice(0, 200);
    const city = collapse(data?.city).slice(0, 100);
    if (!businessName) throw new Error(ENTER_BUSINESS_NAME);
    if (!MEMBER_TYPES.includes(data?.memberType)) throw new Error(CHOOSE_MEMBER_TYPE);
    const memberType = data.memberType;

    // Mobile never uses Google.
    let profile: PlaceProfile | null = null;
    const rawPlaceId = typeof data.placeId === "string" ? data.placeId.trim() : "";
    const placeId = memberType !== "mobile" && PLACE_ID_PATTERN.test(rawPlaceId) ? rawPlaceId : null;
    if (placeId) {
      try {
        profile = mapPlaceToProfile(await getPlaceDetails(placeId));
      } catch (err) {
        console.error("getJoinPreview: Google details failed", err instanceof Error ? err.message : String(err));
        profile = null;
      }
    }
    if (profile?.permanentlyClosed) profile = null;

    const service = await getSupabaseServiceRoleClient();
    const googleCity = profile?.city || null;
    const roster = await loadRosterCandidates(service, citiesToCheck(city, googleCity), placeId);
    if (isAlreadyMemberForPreview({ businessName, city, googleCity, placeId }, roster)) {
      return { kind: "already-member" };
    }

    return {
      kind: "preview",
      data: buildJoinPreviewProfile({
        businessName,
        city,
        memberType,
        profile,
        siteOrigin: resolveEmailSiteUrl(currentRequestUrl()),
        now: new Date(),
      }),
    };
  });
