import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { isValidIanaTimezone } from "@/lib/timezone/timezones";
import type { MemberRow, MemberType } from "@/lib/supabase/types";

export type BasicsPatch = Partial<
  Pick<
    MemberRow,
    | "business_name"
    | "tagline"
    | "city"
    | "state"
    | "street_address"
    | "service_area"
    | "lead_time"
    | "member_since_year"
    | "timezone"
    | "member_type"
  >
>;

/**
 * The exact set of columns this editor is allowed to touch, used both as
 * the runtime allowlist below AND to keep it mechanically in sync with
 * BasicsPatch's type-level Pick list (the `satisfies` clause fails to
 * compile if the two ever drift apart).
 *
 * This exists because BasicsPatch is a TypeScript type -- erased at
 * runtime, enforcing nothing once this handler is actually running on the
 * server. Without filtering `data.patch` down to this list before it
 * reaches `.update()`, any caller of this createServerFn (not just
 * BasicsForm) could POST an arbitrary members column -- e.g.
 * `{ status: "published", hours_confirmed_at: "<forged date>" }` to
 * self-publish past the not-yet-built Publish gate, or point
 * `logo_asset_id`/`cover_asset_id` at another member's media_assets row.
 * RLS and the write-limits trigger block some dangerous columns (slug,
 * dues_received_at, approved_at, approved_by_user_id, trail_eligible) but
 * not all of them -- this allowlist is the actual enforcement boundary,
 * not a convention callers have to remember. Every later section-mutation
 * task (hours, media, events, ...) should copy this exact shape: a
 * `satisfies readonly (keyof <Patch>)[]` key list, filtered into the patch
 * before it ever reaches a `.update()` call.
 */
const BASICS_KEYS = [
  "business_name",
  "tagline",
  "city",
  "state",
  "street_address",
  "service_area",
  "lead_time",
  "member_since_year",
  "timezone",
  "member_type",
] as const satisfies readonly (keyof BasicsPatch)[];

const MIN_MEMBER_SINCE_YEAR = 1800;

/**
 * One mutation for the whole Basics section, called with only the field(s)
 * the member actually changed (this plan's Decision 6 -- the field-level
 * autosave model). tagline's 70-char cap, the member_type enum,
 * timezone's IANA-name validity, member_since_year's plausible range, and
 * the non-empty checks on business_name/city/state are all enforced here
 * as well as client-side, since a DB constraint (or none at all, in
 * timezone's/member_since_year's case) would otherwise either surface as
 * an opaque Postgres error or, worse, silently accept garbage.
 */
export const updateMemberBasics = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; patch: BasicsPatch }) => data)
  .handler(async ({ data }) => {
    // Column allowlist -- see BASICS_KEYS's doc comment. Must run before
    // any of the validation below, so a disallowed key can never smuggle
    // itself through by piggybacking on a request that also happens to
    // patch a legitimate field.
    const patch: BasicsPatch = Object.fromEntries(
      Object.entries(data.patch).filter(([key]) => (BASICS_KEYS as readonly string[]).includes(key)),
    );

    if (Object.keys(patch).length === 0) {
      throw new Error("No basics fields to update.");
    }
    if (typeof patch.business_name === "string" && patch.business_name.trim() === "") {
      throw new Error("Business name can't be empty.");
    }
    if (typeof patch.city === "string" && patch.city.trim() === "") {
      throw new Error("City can't be empty.");
    }
    if (typeof patch.state === "string" && patch.state.trim() === "") {
      throw new Error("State can't be empty.");
    }
    if (typeof patch.tagline === "string" && patch.tagline.length > 70) {
      throw new Error("Tagline must be 70 characters or fewer.");
    }
    if (patch.member_type && !(["producer", "mobile", "allied"] as MemberType[]).includes(patch.member_type)) {
      throw new Error("Invalid member type.");
    }
    if (typeof patch.timezone === "string" && !isValidIanaTimezone(patch.timezone)) {
      throw new Error("Invalid timezone.");
    }
    if (patch.member_since_year !== undefined && patch.member_since_year !== null) {
      const maxYear = new Date().getFullYear() + 1;
      if (
        !Number.isInteger(patch.member_since_year) ||
        patch.member_since_year < MIN_MEMBER_SINCE_YEAR ||
        patch.member_since_year > maxYear
      ) {
        throw new Error(`Member-since year must be between ${MIN_MEMBER_SINCE_YEAR} and ${maxYear}.`);
      }
    }

    const supabase = await getSupabaseServerClientForRequest();
    // `.select("id")` turns a zero-row RLS-denied update (which PostgREST
    // reports as success, `error: null`, with no rows affected -- not an
    // error) into something this handler can actually detect and surface,
    // rather than silently returning { ok: true } for a write that never
    // happened.
    const { data: updated, error } = await supabase
      .from("members")
      .update(patch)
      .eq("id", data.memberId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Save failed -- you may not have permission to edit this member.");
    }
    return { ok: true as const };
  });

/** The subset of MemberRow the Basics editor actually reads and writes. */
export type BasicsMember = Pick<
  MemberRow,
  | "id"
  | "business_name"
  | "tagline"
  | "city"
  | "state"
  | "street_address"
  | "service_area"
  | "lead_time"
  | "member_since_year"
  | "timezone"
  | "member_type"
>;

export const getMemberBasics = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: member, error } = await supabase
      .from("members")
      // Explicit column list, not select("*") -- matches the precedent set
      // by member-profile.server.ts. Without it this would also ship
      // dues_received_at/approved_at/approved_by_user_id/application_note/
      // trail_eligible to the browser; not an RLS leak (this policy already
      // scopes to the caller's own member row) but there's no reason for
      // this editor's response payload to carry columns it never renders.
      .select(
        "id, business_name, tagline, city, state, street_address, service_area, lead_time, member_since_year, timezone, member_type",
      )
      .eq("id", data.memberId)
      .single();
    if (error || !member) throw new Error("Member not found.");
    return member as BasicsMember;
  });
