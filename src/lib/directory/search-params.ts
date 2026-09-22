import type { MemberType } from "@/lib/supabase/types";

/**
 * Shared query-string contract between /members and /members/$slug (spec,
 * "Keeping the visitor's place" and "Next in the directory, not nearest").
 * Both routes' validateSearch must point at this exact function so a link
 * from one round-trips cleanly through the other.
 *
 * `filter`/`sort` are read-only-so-far from this route's point of view --
 * the current /members page has no UI to set them (see this plan's
 * Decisions section) -- but the schema is defined now so a future filter
 * or sort control on that page needs no change here or on the profile
 * route to start working.
 */
export type DirectorySort = "business_name";

export type DirectorySearch = {
  filter?: MemberType;
  sort?: DirectorySort;
  mapLat?: number;
  mapLng?: number;
  mapZoom?: number;
};

const MEMBER_TYPES: ReadonlySet<string> = new Set(["producer", "mobile", "allied"]);
const NUMERIC_KEYS = ["mapLat", "mapLng", "mapZoom"] as const;

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function validateDirectorySearch(search: Record<string, unknown>): DirectorySearch {
  const result: DirectorySearch = {};

  if (typeof search.filter === "string" && MEMBER_TYPES.has(search.filter)) {
    result.filter = search.filter as MemberType;
  }

  if (search.sort === "business_name") {
    result.sort = "business_name";
  }

  for (const key of NUMERIC_KEYS) {
    const parsed = toFiniteNumber(search[key]);
    if (parsed !== undefined) {
      result[key] = parsed;
    }
  }

  return result;
}
