import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import type { MemberRow } from "@/lib/supabase/types";

/**
 * The exact set of `members` columns this editor is allowed to touch --
 * same shape as member-basics.server.ts's BASICS_KEYS and
 * member-links.server.ts's LINK_PATCH_KEYS/CONTACT_PATCH_KEYS, whose own
 * doc comments state this project's convention: this array is the source
 * of truth, and DiscountPatch (below) is DERIVED from it via
 * `Pick<MemberRow, (typeof DISCOUNT_KEYS)[number]>`, never defined
 * independently. That direction matters -- a separately-defined
 * DiscountPatch merely asserted against this array would only catch a
 * STALE entry left behind after a field is removed, not a field added to
 * DiscountPatch and never added here (Task 9's own hard-won correction to
 * exactly this mistake in member-basics.server.ts).
 *
 * The task-31 brief's given handler skipped this filtering step entirely
 * and ran `supabase.from("members").update(patch)` on `{ ...data.patch }`
 * directly -- DiscountPatch's `Partial<Pick<...>>` restriction is a
 * TypeScript-only type, completely erased at runtime, and
 * `.inputValidator((data) => data)` is just an identity function. A raw
 * HTTP request built outside DiscountEditor's own typed object literals
 * could send `{ discount_percent: 5, theme: "hacked", member_type:
 * "producer", logo_asset_id: "<attacker-controlled-asset>" }` and every
 * one of those extra fields would reach `.update()` unfiltered -- exactly
 * the mass-assignment gap BASICS_KEYS's convention exists to close.
 * Filtering `data.patch` down to this list, before anything else runs, is
 * the actual runtime enforcement boundary.
 */
const DISCOUNT_KEYS = [
  "discount_percent",
  "discount_no_fixed_percent",
  "discount_redeem_text",
] as const satisfies readonly (keyof MemberRow)[];

export type DiscountPatch = Partial<Pick<MemberRow, (typeof DISCOUNT_KEYS)[number]>>;

const MIN_DISCOUNT_PERCENT = 0;
const MAX_DISCOUNT_PERCENT = 100;

/**
 * Filters an arbitrary incoming patch object down to DISCOUNT_KEYS --
 * extracted as its own pure function (rather than inlined in the handler)
 * so it's unit-testable without a Supabase client, matching this plan's
 * general preference for pulling allowlist-filtering logic out where a
 * forged raw request -- not just a typed caller -- is the actual threat
 * model being tested.
 *
 * `rawPatch` is typed `unknown`, not `DiscountPatch`, on purpose: the type
 * this function is defending against is exactly a value that ISN'T really
 * a DiscountPatch at runtime (see this file's DISCOUNT_KEYS doc comment).
 * Also guards against a patch that isn't a plain object at all -- a raw
 * request (not built through DiscountEditor's typed object literals)
 * could send `null`, a string, an array, etc., and Object.entries() on
 * those throws a raw TypeError otherwise (same guard as
 * member-basics.server.ts's updateMemberBasics and
 * member-links.server.ts's upsertMemberLink/updateMemberContact).
 */
export function filterDiscountPatch(rawPatch: unknown): DiscountPatch {
  if (typeof rawPatch !== "object" || rawPatch === null || Array.isArray(rawPatch)) {
    throw new Error("Invalid update.");
  }
  return Object.fromEntries(
    Object.entries(rawPatch).filter(([key]) => (DISCOUNT_KEYS as readonly string[]).includes(key)),
  ) as DiscountPatch;
}

/**
 * Server-side range check on discount_percent -- the given `<Input
 * type="number" min={0} max={100}>` in DiscountEditor.tsx is a
 * client-side HTML attribute only, trivially bypassed by any request not
 * built through that form. discount_percent is a `smallint` column with
 * no CHECK constraint, so the database itself won't reject an
 * out-of-business-range value like -5 or 500. This matters more than a
 * typical bad-input case: this is "the most concrete answer this site has
 * to 'what does Guild membership get me'" (DiscountEditor.tsx's own
 * copy) -- it renders large, right under the public profile's status
 * block, so a garbage percentage would be a highly visible, embarrassing
 * display bug on a deliberately prominent part of the page, not just a
 * silently-wrong database value.
 *
 * Only checked when discount_percent is actually present on the filtered
 * patch (via the handler's `"discount_percent" in patch` guard) and only
 * when it's a number -- `null` is a legitimate value (clearing the
 * percent, including as a side effect of the XOR logic below) and must
 * not be rejected here.
 */
export function assertValidDiscountPercent(value: number | null | undefined): void {
  if (typeof value !== "number") return;
  if (!Number.isFinite(value) || value < MIN_DISCOUNT_PERCENT || value > MAX_DISCOUNT_PERCENT) {
    throw new Error(
      `Discount percentage must be between ${MIN_DISCOUNT_PERCENT} and ${MAX_DISCOUNT_PERCENT}.`,
    );
  }
}

/**
 * Percent XOR "no fixed percentage" (spec, "Allied Member discount"): if
 * discount_no_fixed_percent is being set true, discount_percent is cleared
 * in the same patch, and vice versa -- never both set at once.
 *
 * Extracted as its own pure function -- not just inlined in the handler
 * below -- so DiscountEditor.tsx's client-side optimistic state can call
 * this SAME function to mirror the mutation locally, rather than
 * reimplementing (and risking drifting from) it. Without that mirroring,
 * `local` state on the client would diverge from what this handler
 * actually persists: checking "No fixed percentage" would null
 * `discount_percent` in the database via this function, but leave the
 * client's own `local.discount_percent` at its old numeric value, which
 * -- because DiscountEditor's percent `<Input>` is uncontrolled -- would
 * then redisplay as a stale, non-empty value the next time that field
 * re-enables, letting an ordinary blur with no retyping silently
 * resurrect the old percent and revert the member's choice. See
 * DiscountEditor.tsx's save() and its percent `<Input>`'s `key` prop for
 * the client half of this fix.
 */
export function applyDiscountXor(patch: DiscountPatch): DiscountPatch {
  const next = { ...patch };
  if (next.discount_no_fixed_percent === true) next.discount_percent = null;
  if (typeof next.discount_percent === "number") next.discount_no_fixed_percent = false;
  return next;
}

export const updateMemberDiscount = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; patch: DiscountPatch }) => data)
  .handler(async ({ data }) => {
    // Column allowlist -- see DISCOUNT_KEYS's doc comment. Must run before
    // any validation below and before the XOR logic, so a disallowed key
    // can never smuggle itself through by piggybacking on a request that
    // also happens to patch a legitimate field.
    const filtered = filterDiscountPatch(data.patch);

    if (Object.keys(filtered).length === 0) {
      throw new Error("No discount fields to update.");
    }

    // Range validation runs on the RAW filtered value, before applyDiscountXor
    // below has a chance to overwrite discount_percent -- a request that
    // sets an out-of-range discount_percent must be rejected regardless of
    // what else is in the same patch.
    if ("discount_percent" in filtered) {
      assertValidDiscountPercent(filtered.discount_percent);
    }

    const patch = applyDiscountXor(filtered);

    const supabase = await getSupabaseServerClientForRequest();
    // .select("id") + row-count check -- PostgREST reports an RLS-denied
    // UPDATE as success (`error: null`) with zero rows affected, not as an
    // `error` -- same gotcha member-basics.server.ts/cover.server.ts/
    // member-links.server.ts all guard against. Without this, a write
    // blocked by RLS would silently report success back to
    // DiscountEditor's optimistic UI.
    const { data: updated, error } = await supabase
      .from("members")
      .update(patch)
      .eq("id", data.memberId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Save failed — you may not have permission to edit this member.");
    }
    return { ok: true as const };
  });
