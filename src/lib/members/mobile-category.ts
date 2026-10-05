/**
 * A mobile member's pin icon and card tag come from their FIRST category,
 * in the Guild Categories page's order (owner, 2026-10-05; spec "The mobile
 * pin and card"). A fixed list in code -- a new category shows the star
 * until it's given its own icon here. Never from calendar tags.
 */
export type MobileIcon = "truck" | "tent" | "mic" | "star";

export type MobileCategory = { name: string; slug: string; sort_order: number };

const ICON_BY_SLUG: Readonly<Record<string, MobileIcon>> = {
  "food-truck": "truck",
  "pop-up-food-vendor": "tent",
  entertainment: "mic",
};

function first(categories: MobileCategory[]): MobileCategory | null {
  return (
    [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))[0] ?? null
  );
}

export function mobileIconFor(categories: MobileCategory[]): MobileIcon {
  const category = first(categories);
  return (category && ICON_BY_SLUG[category.slug]) || "star";
}

export function mobileTagFor(categories: MobileCategory[]): string {
  return first(categories)?.name.trim().toUpperCase() || "MOBILE";
}
