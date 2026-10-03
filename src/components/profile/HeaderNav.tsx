import { Link } from "@tanstack/react-router";
import type { DirectoryEntry } from "@/lib/directory/list-position";
import type { DirectorySearch } from "@/lib/directory/search-params";
import type { MemberType } from "@/lib/supabase/types";

type HeaderNavProps = {
  prev: DirectoryEntry | null;
  next: DirectoryEntry | null;
  position: { index: number; total: number } | null;
  search: DirectorySearch;
};

// The phone bar's back label names the list the visitor is walking
// (artboard V reads "ALLIED" while browsing Allied Members).
const BACK_LABEL: Record<MemberType, string> = {
  producer: "Producers",
  mobile: "Mobile",
  allied: "Allied",
};

function ChevronLeftIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M11 3.5 5.5 9l5.5 5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M7 3.5 12.5 9 7 14.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * "Back to members" plus previous/next across the visitor's own browsing
 * order (spec, "Next in the directory, not nearest"). All three preserve
 * the current search state on navigation so filter/sort/map-position keep
 * carrying forward, and so "Back to members" restores the exact map view
 * (pan/zoom) the visitor left from (spec, "Keeping the visitor's place").
 * Unlike prev/next, "Back to members" always renders -- it isn't gated by
 * whether a prev/next entry exists.
 *
 * Sits on the dark site ground. Phone (artboards D/E/V): a 56px bar,
 * "← MEMBERS" on the left, "7 / 24" and two 44px chevrons on the right.
 * Desktop (artboard L, md and up): a 68px row with "Back to members",
 * "7 of 24" and outlined Previous / Next buttons.
 */
export function HeaderNav({ prev, next, position, search }: HeaderNavProps) {
  const backLabel = search.filter ? BACK_LABEL[search.filter] : "Members";
  const linkColor = "text-[#B6AC9D] hover:text-text";

  return (
    <nav
      className="-mr-0.5 flex h-14 items-center justify-between pl-0.5 md:mr-0 md:h-[68px] md:pl-0"
      aria-label="Directory navigation"
    >
      <Link to="/members" search={search} className={`flex min-h-11 items-center gap-2 pr-2 md:gap-2.5 ${linkColor}`}>
        <span className="text-base leading-none" aria-hidden="true">
          ←
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] md:hidden">{backLabel}</span>
        <span className="hidden text-[13px] font-medium md:inline">Back to members</span>
      </Link>

      <div className="flex items-center gap-1 md:gap-3.5">
        {position && (
          <span className="pr-1 text-[10px] tracking-[0.12em] text-[#9A9184] md:pr-0 md:text-xs md:tracking-[0.06em]">
            <span className="md:hidden">
              {position.index} / {position.total}
            </span>
            <span className="hidden md:inline">
              {position.index} of {position.total}
            </span>
          </span>
        )}
        {prev && (
          <Link
            to="/members/$slug"
            params={{ slug: prev.slug }}
            search={search}
            className={`flex h-11 w-11 items-center justify-center md:w-auto md:gap-[9px] md:rounded-[9px] md:border md:border-[#38322A] md:px-[15px] md:text-[13px] md:font-medium ${linkColor}`}
            aria-label={`Previous: ${prev.businessName}`}
          >
            <ChevronLeftIcon />
            <span className="hidden md:inline">Previous</span>
          </Link>
        )}
        {next && (
          <Link
            to="/members/$slug"
            params={{ slug: next.slug }}
            search={search}
            className={`flex h-11 w-11 items-center justify-center md:w-auto md:gap-[9px] md:rounded-[9px] md:border md:border-[#38322A] md:px-[15px] md:text-[13px] md:font-medium ${linkColor}`}
            aria-label={`Next: ${next.businessName}`}
          >
            <span className="hidden md:inline">Next</span>
            <ChevronRightIcon />
          </Link>
        )}
      </div>
    </nav>
  );
}
