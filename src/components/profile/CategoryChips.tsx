import type { CategoryRow } from "@/lib/supabase/types";

type CategoryChipsProps = {
  categories: CategoryRow[];
};

/** "What they supply" -- Allied Member only in practice, since only Allied Members have member_categories rows. Omitted entirely when empty. */
export function CategoryChips({ categories }: CategoryChipsProps) {
  if (categories.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Supply categories">
      {categories.map((category) => (
        <li key={category.id} className="rounded-pill border border-canvas-border bg-canvas-2 px-3 py-1 text-sm text-ink">
          {category.name}
        </li>
      ))}
    </ul>
  );
}
