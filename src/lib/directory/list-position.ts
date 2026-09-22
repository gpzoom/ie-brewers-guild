import type { MemberType } from "@/lib/supabase/types";

export type DirectoryEntry = {
  id: string;
  slug: string;
  businessName: string;
  city: string;
  memberType: MemberType;
};

/**
 * Previous/next with wraparound over an already-ordered list (spec,
 * "Next in the directory, not nearest"). Wraps so the last item's "next"
 * is the first item rather than a dead end -- there is no natural end to
 * a directory a visitor is browsing.
 */
export function getAdjacentInList(
  items: DirectoryEntry[],
  currentId: string,
): { prev: DirectoryEntry | null; next: DirectoryEntry | null } {
  if (items.length < 2) {
    return { prev: null, next: null };
  }

  const index = items.findIndex((item) => item.id === currentId);
  if (index === -1) {
    return { prev: null, next: null };
  }

  const prevIndex = (index - 1 + items.length) % items.length;
  const nextIndex = (index + 1) % items.length;

  return { prev: items[prevIndex], next: items[nextIndex] };
}
