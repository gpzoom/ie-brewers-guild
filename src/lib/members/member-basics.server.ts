import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { isValidIanaTimezone } from "@/lib/timezone/timezones";
import { recordAuditLogIfImpersonating } from "@/lib/guild/audit-log.server";
import type { MemberRow, MemberType } from "@/lib/supabase/types";

/**
 * The exact set of `members` columns this editor is allowed to touch --
 * this array is the source of truth; BasicsPatch (below) is DERIVED from
 * it, not the other way around. That inversion is what makes drift
 * structurally impossible in the direction that actually matters: there
 * is no way to add a field to BasicsPatch without adding it here first,
 * because BasicsPatch has no independent definition to add a field to --
 * it's computed as `Pick<MemberRow, (typeof BASICS_KEYS)[number]>`.
 *
 * (An earlier version of this file defined BasicsPatch independently and
 * checked this list against it with `satisfies readonly (keyof
 * BasicsPatch)[]`. That direction only catches a STALE entry left behind
 * after a field is removed from BasicsPatch -- `satisfies` verifies every
 * array element IS a valid key, it does not verify every key of
 * BasicsPatch IS in the array. It silently let a field be added to
 * BasicsPatch and never added here, which is exactly the direction this
 * editor grows in: a new field would simply never save, with no
 * compile-time warning. Fixed by making this list the thing BasicsPatch
 * is generated from, so that failure mode no longer has anywhere to
 * happen.)
 *
 * This remains the runtime enforcement boundary too -- BasicsPatch is
 * still a TypeScript type, erased at runtime, so without filtering
 * `data.patch` down to this list before it reaches `.update()`, any
 * caller of this createServerFn (not just BasicsForm, whose own object
 * literals the type system happens to constrain) could POST an arbitrary
 * members column -- e.g. `{ status: "published", hours_confirmed_at:
 * "<forged date>" }` to self-publish past the not-yet-built Publish gate,
 * or point `logo_asset_id`/`cover_asset_id` at another member's
 * media_assets row. RLS and the write-limits trigger block some
 * dangerous columns (slug, dues_received_at, approved_at,
 * approved_by_user_id, trail_eligible) but not all of them -- this
 * allowlist is the actual enforcement boundary, not a convention callers
 * have to remember.
 *
 * Every later section-mutation task (hours, media, events, ...) should
 * copy this exact shape: a `satisfies readonly (keyof <Row>)[]` key list
 * as the one source of truth, a `Patch` type derived FROM it via `Pick<Row,
 * (typeof KEYS)[number]>` (never defined independently), and a runtime
 * filter of the incoming patch against that same array before it ever
 * reaches a `.update()` call.
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
] as const satisfies readonly (keyof MemberRow)[];

export type BasicsPatch = Partial<Pick<MemberRow, (typeof BASICS_KEYS)[number]>>;

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
    // inputValidator above is an identity function, so `data.patch`'s type
    // is only ever a compile-time promise -- a raw request (not built
    // through BasicsForm's typed object literals) can still send `null`,
    // a string, an array, etc. Object.entries() on those throws a raw
    // TypeError that would otherwise reach the user through the error UI
    // Finding 2 built, instead of a clean message.
    if (typeof data.patch !== "object" || data.patch === null) {
      throw new Error("Invalid update.");
    }

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

    await recordAuditLogIfImpersonating({
      memberId: data.memberId,
      tableName: "members",
      rowId: data.memberId,
      action: "update",
    });

    return { ok: true as const };
  });

/**
 * The subset of MemberRow the Basics editor actually reads and writes.
 * `theme` is read-only here (never part of BASICS_KEYS/BasicsPatch above --
 * updateMemberTheme in member-theme.server.ts is its own, separate
 * write path) -- it's included purely so Task 24's /admin/theme route can
 * reuse this same loader per that plan's own stated choice, rather than
 * this file's editor writing it.
 *
 * `discount_percent`/`discount_no_fixed_percent`/`discount_redeem_text`
 * are likewise read-only here (never part of BASICS_KEYS/BasicsPatch --
 * updateMemberDiscount in discount.server.ts is their own, separate write
 * path, with its own DISCOUNT_KEYS runtime allowlist). Task 31's own
 * stated interface ("Consumes: getMemberBasics") reuses this same loader
 * for /admin/discount, matching the exact precedent Task 24 set for
 * `theme` above -- a read-only extension of this select list/type, not a
 * new field added to the writable BASICS_KEYS allowlist.
 */
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
  | "theme"
  | "discount_percent"
  | "discount_no_fixed_percent"
  | "discount_redeem_text"
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
        "id, business_name, tagline, city, state, street_address, service_area, lead_time, member_since_year, timezone, member_type, theme, discount_percent, discount_no_fixed_percent, discount_redeem_text",
      )
      .eq("id", data.memberId)
      .single();
    if (error || !member) throw new Error("Member not found.");
    return member as BasicsMember;
  });
