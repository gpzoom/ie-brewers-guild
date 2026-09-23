import { useState } from "react";
import { applyDiscountXor, updateMemberDiscount } from "@/lib/members/discount.server";
import { isFieldVisibleForMemberType } from "@/lib/members/type-fields";
import type { BasicsMember } from "@/lib/members/member-basics.server";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function friendlyMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Picks just the given keys off `obj` -- same shape as
 * LinksContactEditor.tsx's/EventsEditor.tsx's own pickFields, used here so
 * save()'s rollback snapshot is scoped to only the field(s) a given patch
 * actually touches, never the whole member row. Restoring a whole-row
 * snapshot captured at save-call time would silently undo any OTHER field
 * (a different discount field, or an unrelated Basics field on the same
 * `members` row) that a concurrent save changed successfully while this
 * request was still in flight -- exactly the mistake this plan has
 * repeatedly found and fixed elsewhere (CarouselEditor's crop-autosave,
 * EventsEditor's onFieldChange/onOverlayChange/onToggleHidden,
 * LinksContactEditor's onFieldChange).
 */
function pickFields<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const picked = {} as Pick<T, K>;
  for (const key of keys) picked[key] = obj[key];
  return picked;
}

/**
 * Only rendered for member_type = allied (spec: "The field only appears
 * for the Allied Member type"). Values are never cleared by a type
 * switch -- this route/component simply doesn't render for other types,
 * and member-basics.server.ts's own patch-only-what-changed model means
 * switching away from allied and back leaves these columns untouched.
 *
 * `member` is `BasicsMember` (member-basics.server.ts), not the full
 * `MemberRow` -- getMemberBasics's select list is scoped to exactly the
 * columns Basics/Theme/Discount actually read, so that's what this route's
 * loader hands down. See BasicsMember's own doc comment for why the
 * discount columns are read-only there (updateMemberDiscount below is
 * their real write path).
 */
export function DiscountEditor({ member }: { member: BasicsMember }) {
  const [local, setLocal] = useState(member);
  const [error, setError] = useState<string | null>(null);

  if (!isFieldVisibleForMemberType(local.member_type, "discount")) {
    return (
      <p className="text-sm text-muted-foreground">This section is only for Allied Members.</p>
    );
  }

  /**
   * Optimistically applies `patch`, then awaits the mutation and rolls
   * back on failure -- the brief's given fire-and-forget shape had no
   * try/catch at all, so a rejection from updateMemberDiscount (including
   * the allowlist/range-validation/row-count throws added to
   * discount.server.ts) would leave the optimistic change showing with no
   * rollback and no visible error. Rollback snapshot is taken from `local`
   * BEFORE the optimistic update, scoped to just the field(s) in the
   * (post-mirroring) patch via pickFields -- see that function's own doc
   * comment for why a whole-object snapshot would be wrong here.
   *
   * Applies discount.server.ts's own applyDiscountXor to the CLIENT copy
   * of the patch before applying it locally, so `local` never diverges
   * from what the server actually persists -- reusing that exact
   * function (rather than reimplementing the same two-line mutation here)
   * so the two copies can't drift apart. Without this, checking "No fixed
   * percentage" would set `local.discount_no_fixed_percent = true` but
   * leave `local.discount_percent` at its old numeric value (only the
   * DATABASE row gets nulled, via the server's own applyDiscountXor call)
   * -- and since the percent `<Input>` below is uncontrolled, unchecking
   * the box again would then redisplay that stale number instead of
   * empty, and an ordinary blur with no retyping would silently
   * resurrect it and flip discount_no_fixed_percent back to false
   * server-side. See the `key={...}` comment on the Input below for the
   * other half of this fix -- that half makes the Input's DOM value
   * actually refresh from `local.discount_percent`; this half is what
   * makes that value correct once it does.
   */
  function save(rawPatch: Parameters<typeof updateMemberDiscount>[0]["data"]["patch"]) {
    setError(null);
    const patch = applyDiscountXor(rawPatch);

    const previousValues = pickFields(local, Object.keys(patch) as (keyof BasicsMember)[]);
    setLocal((prev) => ({ ...prev, ...patch }));
    updateMemberDiscount({ data: { memberId: member.id, patch } }).catch((err: unknown) => {
      setLocal((prev) => ({ ...prev, ...previousValues }));
      setError(friendlyMessage(err, "Couldn't save that change — try again."));
    });
  }

  return (
    <div className="max-w-md space-y-4">
      <h2 className="text-lg font-medium text-foreground">Member discount</h2>
      <p className="text-xs text-muted-foreground">
        The most concrete answer this site has to "what does Guild membership get me" — renders
        large, right under your status block.
      </p>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div>
        <Label htmlFor="discount-percent">Discount percentage</Label>
        <Input
          // Remount whenever discount_no_fixed_percent flips -- this
          // Input is uncontrolled (defaultValue, not value), so its
          // displayed DOM value otherwise never updates from React state
          // after the initial mount, even once `local.discount_percent`
          // changes underneath it. Concretely: check "No fixed
          // percentage" (server nulls discount_percent via the XOR logic
          // in discount.server.ts) -> uncheck it again (field re-enables
          // but, without this key, would still show the STALE
          // pre-toggle number, not the fresh null) -> an ordinary
          // tab-through blur with no retyping would then call
          // save({ discount_percent: <stale value> }), which the
          // server's own XOR logic would use to silently flip
          // discount_no_fixed_percent back to false -- reverting the
          // member's just-completed choice on a completely ordinary
          // interaction, not an edge case. Changing `key` forces React to
          // discard the old DOM node and mount a fresh one, which reads
          // `defaultValue` from the CURRENT `local.discount_percent`
          // (null -> "") rather than keeping the stale one around.
          key={String(local.discount_no_fixed_percent)}
          id="discount-percent"
          type="number"
          min={0}
          max={100}
          disabled={local.discount_no_fixed_percent}
          defaultValue={local.discount_percent ?? ""}
          className="mt-1 h-11"
          onBlur={(e) => save({ discount_percent: e.target.value ? Number(e.target.value) : null })}
        />
      </div>

      <label className="flex min-h-11 items-center gap-2">
        <Checkbox
          checked={local.discount_no_fixed_percent}
          onCheckedChange={(checked) => save({ discount_no_fixed_percent: checked === true })}
        />
        <span>No fixed percentage — discounts vary</span>
      </label>

      <div>
        <Label htmlFor="discount-redeem">How members redeem it</Label>
        <Textarea
          id="discount-redeem"
          defaultValue={local.discount_redeem_text ?? ""}
          className="mt-1"
          onBlur={(e) => save({ discount_redeem_text: e.target.value || null })}
        />
      </div>
    </div>
  );
}
