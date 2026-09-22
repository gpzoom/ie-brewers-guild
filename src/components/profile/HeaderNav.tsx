import { Link } from "@tanstack/react-router";
import type { DirectoryEntry } from "@/lib/directory/list-position";
import type { DirectorySearch } from "@/lib/directory/search-params";
import { ChevronLeft, ChevronRight } from "lucide-react";

type HeaderNavProps = {
  prev: DirectoryEntry | null;
  next: DirectoryEntry | null;
  search: DirectorySearch;
};

/**
 * "Back to members" plus previous/next across the visitor's own browsing
 * order (spec, "Next in the directory, not nearest"). All three preserve
 * the current search state on navigation so filter/sort/map-position keep
 * carrying forward, and so "Back to members" restores the exact map view
 * (pan/zoom) the visitor left from (spec, "Keeping the visitor's place").
 * Unlike prev/next, "Back to members" always renders -- it isn't gated by
 * whether a prev/next entry exists.
 */
export function HeaderNav({ prev, next, search }: HeaderNavProps) {
  return (
    <nav className="flex items-center justify-between" aria-label="Directory navigation">
      <Link
        to="/members"
        search={search}
        className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-text hover:text-brand-bright"
      >
        <ChevronLeft className="h-4 w-4" /> Back to members
      </Link>
      <div className="flex items-center gap-1">
        {prev && (
          <Link
            to="/members/$slug"
            params={{ slug: prev.slug }}
            search={search}
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-text hover:text-brand-bright"
            aria-label={`Previous: ${prev.businessName}`}
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </Link>
        )}
        {next && (
          <Link
            to="/members/$slug"
            params={{ slug: next.slug }}
            search={search}
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-text hover:text-brand-bright"
            aria-label={`Next: ${next.businessName}`}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </nav>
  );
}
