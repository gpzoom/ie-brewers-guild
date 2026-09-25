import type { CategoryRow } from "@/lib/supabase/types";
import { SectionLabel } from "@/components/profile/SectionLabel";

type CategoryChipsProps = {
  categories: CategoryRow[];
};

/** "What they supply" (artboard V) -- Allied Member only in practice, since only Allied Members have member_categories rows. Omitted entirely when empty. */
export function CategoryChips({ categories }: CategoryChipsProps) {
  if (categories.length === 0) return null;

  return (
    <section className="flex flex-col gap-[9px] lg:gap-[11px]">
      <SectionLabel>What they supply</SectionLabel>
      <ul className="flex flex-wrap gap-[7px]" aria-label="Supply categories">
        {categories.map((category) => (
          <li key={category.id} className="rounded-pill bg-canvas-2 px-[13px] py-2 text-xs font-medium text-ink">
            {category.name}
          </li>
        ))}
      </ul>
    </section>
  );
}
