import { useRef, useState } from "react";
import type { CategoryMemberType, CategoryRow } from "@/lib/supabase/types";
import { useSaveDraftSection } from "@/components/admin/DraftStatusContext";

/**
 * "What you supply" (plan Decision 8): the Guild's categories as checkbox
 * chips, part of the Member discount & supplies section. The choice saves
 * as `category_ids` in the draft's `discount` section (sent whole on every
 * change, like the other list editors) and reaches member_categories when
 * published. There was no member-facing editor for categories before this.
 *
 * Mobile members get the same picker over their own list ("What you
 * offer": Entertainment, Food Truck, ...), on Basics & hours -- the choice
 * saves to the same `category_ids`. Each type sees only its own list;
 * picks from the other list (left from before a type change) are kept,
 * never sent away, since a type change never deletes data. Any number of
 * categories can be picked.
 *
 * Optimistic: a chip flips straight away and flips back if its save fails.
 * Each save builds its list from a ref WHEN IT RUNS (the patch is a
 * function), with saves for the section queued in order, so two quick taps
 * both land.
 */
const COPY: Record<CategoryMemberType, { heading: string; lede: string; empty: string }> = {
  allied: {
    heading: "What you supply",
    lede: "Pick everything that fits. Members browsing the directory find you under these.",
    empty: "The Guild hasn't set up any supply categories yet.",
  },
  mobile: {
    heading: "What you offer",
    lede: "Pick everything that fits. Visitors browsing the directory find you under these.",
    empty: "The Guild hasn't set up any categories for Mobile members yet.",
  },
};

export function SupplyCategoriesPicker({
  memberId,
  categories: allCategories,
  initialCategoryIds,
  memberType = "allied",
}: {
  memberId: string;
  /** Every Guild category; the picker shows the ones for `memberType`. */
  categories: CategoryRow[];
  initialCategoryIds: string[];
  memberType?: CategoryMemberType;
}) {
  const saveDraft = useSaveDraftSection(memberId);
  const copy = COPY[memberType];
  const categories = allCategories.filter((c) => c.member_type === memberType);
  const headingId = `categories-heading-${memberType}`;
  // Only ids the Guild still lists: a deleted category can't be re-sent.
  const known = new Set(categories.map((c) => c.id));
  // Picks from the other type's list, kept as they are in every save.
  const [otherTypeIds] = useState<string[]>(() => {
    const other = new Set(allCategories.filter((c) => c.member_type !== memberType).map((c) => c.id));
    return initialCategoryIds.filter((id) => other.has(id));
  });
  const [selected, setSelected] = useState<string[]>(() =>
    initialCategoryIds.filter((id) => known.has(id)),
  );
  const selectedRef = useRef<string[]>(selected);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);

  function update(next: string[]) {
    selectedRef.current = next;
    setSelected(next);
  }

  async function toggle(id: string) {
    setError(null);
    const wasSelected = selectedRef.current.includes(id);
    update(
      wasSelected
        ? selectedRef.current.filter((x) => x !== id)
        : // Kept in the Guild's category order, not tap order.
          categories.map((c) => c.id).filter((x) => x === id || selectedRef.current.includes(x)),
    );
    setSaving((n) => n + 1);
    try {
      await saveDraft("discount", () => ({
        category_ids: [...otherTypeIds, ...selectedRef.current],
      }));
    } catch (err) {
      // Undo just this chip, against the CURRENT list.
      update(
        wasSelected
          ? categories.map((c) => c.id).filter((x) => x === id || selectedRef.current.includes(x))
          : selectedRef.current.filter((x) => x !== id),
      );
      setError(err instanceof Error ? err.message : "Couldn't save that change — try again.");
    } finally {
      setSaving((n) => n - 1);
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2
            id={headingId}
            className="font-sans text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted"
          >
            {copy.heading}
          </h2>
          <span aria-live="polite" className="text-[12px] text-ink-muted">
            {saving > 0 ? "Saving…" : ""}
          </span>
        </div>
        <p className="text-[12px] leading-[1.5] text-ink-muted">
          {copy.lede}
        </p>
      </div>

      {categories.length === 0 ? (
        <p className="rounded-[11px] bg-canvas-2 px-[15px] py-3 text-[13px] text-ink-muted">
          {copy.empty}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby={headingId}>
          {categories.map((category) => {
            const checked = selected.includes(category.id);
            const inputId = `supply-${category.id}`;
            return (
              <label
                key={category.id}
                htmlFor={inputId}
                className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand has-[:focus-visible]:ring-offset-2 ${
                  checked
                    ? "border-2 border-ink bg-ink text-canvas"
                    : "border border-canvas-border bg-white text-ink hover:border-ink-subtle"
                }`}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={checked}
                  onChange={() => void toggle(category.id)}
                  className="sr-only"
                />
                {checked && (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M3 8.5l3.2 3.2L13 5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                {category.name}
              </label>
            );
          })}
        </div>
      )}

      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
