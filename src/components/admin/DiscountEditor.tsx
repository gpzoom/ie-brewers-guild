import { useState, type ReactNode } from "react";
import { applyDiscountXor, type DiscountPatch } from "@/lib/members/discount";
import { isFieldVisibleForMemberType } from "@/lib/members/type-fields";
import type { DiscountDraft } from "@/lib/drafts/sections";
import type { MemberType } from "@/lib/supabase/types";
import { useSaveDraftSection } from "@/components/admin/DraftStatusContext";
import { SaveNoteText } from "@/components/admin/SaveNote";

const controlClass =
  "h-[46px] w-full rounded-[9px] border border-canvas-border bg-white px-[13px] text-sm text-ink placeholder:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30";

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
 * Phase 2: reads and saves the member's DRAFT (the `discount` section);
 * changes reach the public page when published. Member type is live (it
 * isn't drafted) and only decides whether this editor shows.
 */
export function DiscountEditor({
  memberId,
  memberType,
  discount,
  showHeading = true,
  children,
}: {
  memberId: string;
  memberType: MemberType;
  discount: DiscountDraft;
  /** False where the page around it has its own heading (the setup wizard's step chrome). */
  showHeading?: boolean;
  /** Extra discount-section content shown under the discount block (the supply categories picker). */
  children?: ReactNode;
}) {
  const saveDraft = useSaveDraftSection(memberId);
  const [local, setLocal] = useState(discount);
  const [error, setError] = useState<string | null>(null);

  if (!isFieldVisibleForMemberType(memberType, "discount")) {
    return (
      <div className="flex max-w-[640px] flex-col gap-[26px]">
        {showHeading && <PageHeading />}
        <div className="flex items-start gap-3 rounded-[11px] bg-canvas-2 px-[17px] py-[15px] text-ink-muted">
          <svg
            width="17"
            height="17"
            viewBox="0 0 16 16"
            fill="none"
            className="mt-px shrink-0"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M8 7.2v4M8 4.9v.9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <p className="text-[13px] leading-normal text-ink">
            This section is only for Allied Members.
          </p>
        </div>
      </div>
    );
  }

  /**
   * Optimistically applies `patch`, then awaits the mutation and rolls
   * back on failure -- the brief's given fire-and-forget shape had no
   * try/catch at all, so a rejection from the draft save (including the
   * range checks in src/lib/drafts/validate-patch.ts) would leave the
   * optimistic change showing with no
   * rollback and no visible error. Rollback snapshot is taken from `local`
   * BEFORE the optimistic update, scoped to just the field(s) in the
   * (post-mirroring) patch via pickFields -- see that function's own doc
   * comment for why a whole-object snapshot would be wrong here.
   *
   * Applies src/lib/members/discount.ts's own applyDiscountXor to the CLIENT copy
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
  function save(rawPatch: DiscountPatch) {
    setError(null);
    const patch = applyDiscountXor(rawPatch);

    const previousValues = pickFields(local, Object.keys(patch) as (keyof DiscountDraft)[]);
    setLocal((prev) => ({ ...prev, ...patch }));
    saveDraft("discount", patch).catch((err: unknown) => {
      setLocal((prev) => ({ ...prev, ...previousValues }));
      setError(friendlyMessage(err, "Couldn't save that change — try again."));
    });
  }

  return (
    <div className="flex max-w-[640px] flex-col gap-[26px]">
      {showHeading && <PageHeading />}

      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}

      <section
        aria-labelledby="discount-block-label"
        className="flex flex-col gap-4 rounded-[13px] border-2 border-brand bg-[#FCF3EA] px-5 py-[18px] max-md:px-[15px] max-md:py-4"
      >
        <div className="flex flex-col gap-1">
          <h2
            id="discount-block-label"
            className="font-sans text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7A4413]"
          >
            Guild member discount
          </h2>
          <p className="text-xs leading-[1.45] text-ink-muted">
            Shown large and in color near the top of your profile. If your discount varies, check
            “No fixed percentage” instead of entering a number.
          </p>
        </div>

        <div className="flex flex-col gap-[7px]">
          <label htmlFor="discount-percent" className="text-[13px] font-medium text-ink">
            Discount percentage
          </label>
          <div className="flex items-center gap-2.5">
            <input
              // Remount whenever discount_no_fixed_percent flips -- this
              // input is uncontrolled (defaultValue, not value), so its
              // displayed DOM value otherwise never updates from React state
              // after the initial mount, even once `local.discount_percent`
              // changes underneath it. Concretely: check "No fixed
              // percentage" (server nulls discount_percent via the XOR logic
              // in src/lib/members/discount.ts) -> uncheck it again (field re-enables
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
              inputMode="numeric"
              min={0}
              max={100}
              disabled={local.discount_no_fixed_percent}
              defaultValue={local.discount_percent ?? ""}
              className={`${controlClass} w-24 disabled:cursor-not-allowed disabled:border-canvas-2 disabled:bg-[#F2EEE7] disabled:text-ink-subtle`}
              onBlur={(e) =>
                save({ discount_percent: e.target.value ? Number(e.target.value) : null })
              }
            />
            <span
              className={`text-[15px] ${local.discount_no_fixed_percent ? "text-ink-subtle" : "text-ink-muted"}`}
            >
              % off
            </span>
          </div>
        </div>

        <label
          htmlFor="discount-no-fixed"
          className="flex min-h-11 cursor-pointer items-start gap-[11px] pt-0.5"
        >
          <input
            id="discount-no-fixed"
            type="checkbox"
            checked={local.discount_no_fixed_percent}
            onChange={(e) => save({ discount_no_fixed_percent: e.target.checked })}
            className="mt-0.5 size-[18px] shrink-0 accent-brand"
          />
          <span className="flex flex-col gap-[3px]">
            <span className="text-[13px] text-ink">No fixed percentage — discounts vary</span>
            <span className="text-xs leading-[1.45] text-ink-muted">
              Your profile will read “Discounts available to members in good standing”.
            </span>
          </span>
        </label>

        <div className="flex flex-col gap-[7px]">
          <label htmlFor="discount-redeem" className="text-[13px] font-medium text-ink">
            How members redeem it
          </label>
          <textarea
            id="discount-redeem"
            rows={2}
            defaultValue={local.discount_redeem_text ?? ""}
            placeholder="e.g. Show your Guild card at checkout"
            className={`${controlClass} h-auto min-h-[46px] resize-y py-3 leading-normal`}
            onBlur={(e) => save({ discount_redeem_text: e.target.value || null })}
          />
        </div>
      </section>

      {children}

      <div className="flex items-center gap-5 border-t border-[#E6E0D6] pt-[22px]">
        <p className="text-[13px] text-ink-muted">
          <SaveNoteText />
        </p>
      </div>
    </div>
  );
}

function PageHeading() {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="font-display text-[27px] font-bold leading-tight text-ink">Member discount</h1>
      <p className="text-pretty text-[13px] text-ink-muted">
        The most concrete answer this site has to “what does Guild membership get me” — renders
        large, right under your status block.
      </p>
    </div>
  );
}
