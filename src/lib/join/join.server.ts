import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendTransactionalEmail } from "@/lib/email/send";
import { resolveEmailSiteUrl } from "@/lib/email/build-email-content";
import { createAuthUser, findAuthUserIdByEmail } from "@/lib/guild/auth-accounts.server";
import { generateUniqueMemberSlug } from "@/lib/guild/unique-member-slug.server";
import { isHoneypotTripped } from "@/lib/contact/contact-form-validation";
import { slugify } from "@/lib/slug";
import { mapPlaceToProfile, type PlaceProfile } from "@/lib/google/place-profile";
import { getPlaceDetails, searchPlaces, type PlaceCandidate } from "@/lib/google/places-client.server";
import { SOMETHING_WRONG, collapse, rateLimitMessage } from "@/lib/join/join-guards.server";
import { findDuplicate } from "@/lib/join/duplicate-check";
import { loadRosterCandidates } from "@/lib/join/duplicate-check.server";
import { validateJoinInput, type JoinFieldErrors, type JoinInput } from "@/lib/join/join-validation";
import { submitJoinCore, type JoinOutcome } from "@/lib/join/submit-join-core";

/**
 * Join the Guild, step 1 (public, no account). Two server functions the
 * /join page calls directly -- like submit-contact-form.server.ts, each
 * handler is its own rate-limit enforcement point, since a createServerFn is
 * a network-reachable endpoint whoever calls it.
 *
 * Everything here runs with the service-role client, so nothing from the
 * browser is trusted: the input is re-validated, Google details are
 * re-fetched by place id, and the already-a-member check runs again. The
 * answer never says whether the email already has a login.
 *
 * Return shapes (for the page):
 * - joinSearchPlaces → { kind: "results", candidates } | { kind: "error", message }
 * - submitJoin → { kind: "check-email" } | { kind: "already-member" }
 *               | { kind: "invalid", errors } | { kind: "error", message }
 * `message` is always safe to show as-is.
 */

export type JoinSearchResult = { kind: "results"; candidates: PlaceCandidate[] } | { kind: "error"; message: string };
export type SubmitJoinResult =
  | JoinOutcome
  | { kind: "invalid"; errors: JoinFieldErrors }
  | { kind: "error"; message: string };

const SEARCH_FAILED = "We couldn't search Google right now. You can continue without it.";
const SEARCH_NAME_MAX = 200;
const SEARCH_CITY_MAX = 100;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** "Is this you?" -- up to 5 Google matches for the typed name and city. */
export const joinSearchPlaces = createServerFn({ method: "POST" })
  .inputValidator((data: { businessName: string; city: string }) => data)
  .handler(async ({ data }): Promise<JoinSearchResult> => {
    const limited = await rateLimitMessage("join-search");
    if (limited) return { kind: "error", message: limited };

    const businessName = collapse(data?.businessName);
    const city = collapse(data?.city);
    if (!businessName) return { kind: "error", message: "Enter your business name." };
    if (businessName.length > SEARCH_NAME_MAX || city.length > SEARCH_CITY_MAX) {
      return { kind: "error", message: SEARCH_FAILED };
    }

    try {
      return { kind: "results", candidates: await searchPlaces(businessName, city) };
    } catch (err) {
      console.error("joinSearchPlaces: Google search failed", errorMessage(err));
      return { kind: "error", message: SEARCH_FAILED };
    }
  });

/** Owner emails (lowercased) of the given members, via member_users role 'owner'. */
async function loadOwnerEmails(service: SupabaseClient, memberIds: string[]): Promise<Map<string, Set<string>>> {
  const byMember = new Map<string, Set<string>>();
  if (memberIds.length === 0) return byMember;
  const { data, error } = await service
    .from("member_users")
    .select("member_id, user_id")
    .in("member_id", memberIds)
    .eq("role", "owner");
  if (error) throw new Error(`Could not load owners: ${error.message}`);
  for (const row of (data ?? []) as { member_id: string; user_id: string }[]) {
    const { data: userData, error: userError } = await service.auth.admin.getUserById(row.user_id);
    if (userError) throw new Error(`Could not load an owner: ${userError.message}`);
    const email = userData?.user?.email?.trim().toLowerCase();
    if (!email) continue;
    const set = byMember.get(row.member_id) ?? new Set<string>();
    set.add(email);
    byMember.set(row.member_id, set);
  }
  return byMember;
}

async function insertApplicant(service: SupabaseClient, input: JoinInput, profile: PlaceProfile | null): Promise<string> {
  // A name with no letters or digits (e.g. all emoji) would slug to "".
  const slug = await generateUniqueMemberSlug(service, slugify(input.businessName) ? input.businessName : "member");

  const { data: member, error } = await service
    .from("members")
    .insert({
      slug,
      business_name: input.businessName,
      member_type: input.memberType,
      status: "applied",
      applied_via_join_at: new Date().toISOString(),
      google_place_id: input.placeId,
      contact_email: input.email,
      // Google's address block when there is one (kept together), else the
      // typed city. state defaults to CA like the schema.
      city: profile?.city || input.city,
      state: profile?.state || "CA",
      street_address: profile?.street_address ?? null,
      postal_code: profile?.postal_code ?? null,
      latitude: profile?.latitude ?? null,
      longitude: profile?.longitude ?? null,
      phone: profile?.phone ?? null,
      tagline: profile?.tagline ?? null,
    })
    .select("id")
    .single();
  if (error || !member) throw new Error(error?.message ?? "Could not create the applicant.");
  const memberId = (member as { id: string }).id;

  // The member exists from here: a failed child insert removes it again
  // (hours and links cascade), since the core never learns its id.
  try {
    if (profile?.hours) {
      const { error: hoursError } = await service.from("hours").insert(
        profile.hours.map((h) => ({
          member_id: memberId,
          weekday: h.weekday,
          opens_at: h.opens_at,
          closes_at: h.closes_at,
          closes_next_day: h.closes_next_day,
          is_closed: h.is_closed,
        })),
      );
      if (hoursError) throw new Error(`Could not save hours: ${hoursError.message}`);
    }
    if (profile?.website) {
      const { error: linkError } = await service
        .from("member_links")
        .insert({ member_id: memberId, kind: "website", url: profile.website, sort_order: 0 });
      if (linkError) throw new Error(`Could not save the website: ${linkError.message}`);
    }
  } catch (err) {
    const { error: deleteError } = await service.from("members").delete().eq("id", memberId);
    if (deleteError) console.error("submitJoin: failed to remove a half-created applicant", deleteError.message);
    throw err;
  }
  return memberId;
}

/** "Submit to the Guild". */
export const submitJoin = createServerFn({ method: "POST" })
  .inputValidator((data: JoinInput) => data)
  .handler(async ({ data }): Promise<SubmitJoinResult> => {
    const limited = await rateLimitMessage("join-submit");
    if (limited) return { kind: "error", message: limited };

    // A tripped honeypot gets the same answer as a real submission, and
    // nothing is created or sent.
    if (isHoneypotTripped(typeof data?.honeypot === "string" ? data.honeypot : "")) {
      return { kind: "check-email" };
    }

    const validation = validateJoinInput(data);
    if (!validation.ok) return { kind: "invalid", errors: validation.errors };
    const input = validation.value;

    // Same site the request came from, so a staging submit links to staging.
    let requestUrl: string | null = null;
    try {
      requestUrl = getRequest().url;
    } catch {
      requestUrl = null;
    }
    const siteUrl = resolveEmailSiteUrl(requestUrl);

    try {
      const service = await getSupabaseServiceRoleClient();
      return await submitJoinCore(
        {
          async findDuplicate({ businessName, city, placeId, email }) {
            const roster = await loadRosterCandidates(service, city, placeId);
            // Only a Join application can be "your own"; only its owner's
            // email counts.
            const joinIds = roster.filter((r) => r.status === "applied" && r.applied_via_join_at).map((r) => r.id);
            const owners = await loadOwnerEmails(service, joinIds);
            const wanted = email.trim().toLowerCase();
            return findDuplicate(
              { businessName, city, placeId, ownerEmailMatches: (memberId) => owners.get(memberId)?.has(wanted) ?? false },
              roster,
            );
          },
          async getProfile(placeId) {
            return mapPlaceToProfile(await getPlaceDetails(placeId));
          },
          async createApplicant(applicant, profile) {
            return insertApplicant(service, applicant, profile);
          },
          async createOrFindUser(email) {
            const created = await createAuthUser(service, email);
            if (created.ok) return { userId: created.userId, created: true };
            if (!created.emailTaken) throw new Error(created.message);
            const found = await findAuthUserIdByEmail(service, email);
            if (!found) throw new Error(created.message);
            return { userId: found, created: false };
          },
          async linkOwner(memberId, userId) {
            const { error } = await service.from("member_users").insert({ member_id: memberId, user_id: userId, role: "owner" });
            if (error) throw new Error(error.message);
          },
          async deleteUser(userId) {
            const { error } = await service.auth.admin.deleteUser(userId);
            if (error) throw new Error(error.message);
          },
          async deleteMember(memberId) {
            const { error } = await service.from("members").delete().eq("id", memberId);
            if (error) throw new Error(error.message);
          },
          async sendGuildEmail(memberId) {
            await sendTransactionalEmail({
              trigger: "membership_application",
              memberId,
              businessName: input.businessName,
              memberType: input.memberType,
              city: input.city,
              email: input.email,
            });
          },
          async sendDraftLink(email, businessName) {
            // generateLink sends no email of its own; ours goes through
            // Resend with Guild wording and lands on /join/finish.
            const { data: linkData, error } = await service.auth.admin.generateLink({ type: "magiclink", email });
            const hashed = linkData?.properties?.hashed_token;
            if (error || !hashed) throw new Error(error?.message ?? "Could not make a sign-in link.");
            const link = `${siteUrl}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=magiclink&next=/join/finish`;
            await sendTransactionalEmail({ trigger: "join_draft_link", email, businessName, link });
          },
        },
        input,
      );
    } catch (err) {
      console.error("submitJoin failed", errorMessage(err));
      return { kind: "error", message: SOMETHING_WRONG };
    }
  });
