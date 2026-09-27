import type { CategoryRow, MemberType } from "@/lib/supabase/types";
import { SectionLabel } from "@/components/profile/SectionLabel";

type CategoryChipsProps = {
  categories: CategoryRow[];
  memberType: MemberType;
};

/**
 * "What they supply" (artboard V) for an Allied Member, "What they offer"
 * for a Mobile member. Only the categories of the member's current type
 * show (a type change keeps the old picks but doesn't display them).
 * Omitted entirely when empty.
 */
export function CategoryChips({ categories: all, memberType }: CategoryChipsProps) {
  const categories = all.filter((category) => category.member_type === memberType);
  if (categories.length === 0) return null;

  return (
    <section className="flex flex-col gap-[9px] lg:gap-[11px]">
      <SectionLabel>{memberType === "mobile" ? "What they offer" : "What they supply"}</SectionLabel>
      <ul className="flex flex-wrap gap-[7px]" aria-label="Categories">
        {categories.map((category) => (
          <li key={category.id} className="rounded-pill bg-canvas-2 px-[13px] py-2 text-xs font-medium text-ink">
            {category.name}
          </li>
        ))}
      </ul>
    </section>
  );
}
