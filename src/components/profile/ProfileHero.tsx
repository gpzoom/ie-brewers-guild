import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { MemberImage } from "@/components/profile/MemberImage";
import { LogoChip } from "@/components/profile/LogoChip";
import type { MemberRow } from "@/lib/supabase/types";
import type { DirectoryEntry } from "@/lib/directory/list-position";
import type { DirectorySearch } from "@/lib/directory/search-params";

type ProfileHeroProps = {
  member: MemberRow;
  coverUrl: string | null;
  logoUrl: string | null;
  nextLocation: DirectoryEntry | null;
  search: DirectorySearch;
};

const MEMBER_TYPE_BADGE: Record<MemberRow["member_type"], string> = {
  producer: "Producer",
  mobile: "Mobile Member",
  allied: "Allied Member",
};

/**
 * The cover band, logo chip, name/badge, and tagline. On phone the cover
 * is 2.5:1; the desktop split (Task 17's route component) swaps in a
 * wider aspect class via the `aspectClassName` prop's caller, per the
 * spec's own breakpoint description. See this plan's Decisions section
 * for why the desktop crop reuses the same stored rectangle rather than
 * an independently-composed 4:1 crop.
 */
export function ProfileHero({ member, coverUrl, logoUrl, nextLocation, search }: ProfileHeroProps) {
  // The -mt-9/-mt-13 pull-up exists so the LOGO overlaps the cover's
  // lower edge (spec, "Profile hero and theme": "the logo chip
  // overlapping its lower edge, the name and badge alongside"). It
  // assumes the row's own height is set by the logo (a fixed 72px/104px
  // chip via LogoChip), with the shorter text column just riding along,
  // bottom-aligned via items-end. LogoChip renders nothing at all for a
  // null src (spec, "Migrating the existing members": most launch
  // profiles have no logo yet) -- with no logo, the row collapses to
  // just the text column's own height, which varies with the business
  // name's length and the viewport width (it wraps to 2 lines on a long
  // name at 390px). No fixed min-height can safely absorb an unbounded
  // text height, so the negative margin is applied only when there's
  // actually a logo to overlap; with no logo, the row stays in normal
  // flow (with its own small top padding instead) and can never be
  // pulled into the cover no matter how tall the text gets.
  const heroRowClassName = logoUrl
    ? "relative -mt-9 flex items-end gap-4 px-4 md:-mt-13 md:px-6"
    : "relative flex items-end gap-4 px-4 pt-3 md:px-6 md:pt-4";

  return (
    <div className="relative">
      <MemberImage
        src={coverUrl}
        crop={member.cover_crop}
        alt={`${member.business_name} cover photo`}
        theme={member.theme}
        aspectClassName="aspect-[2.5/1] md:aspect-[4/1]"
        className="rounded-none md:rounded-card"
      />
      <div className={heroRowClassName}>
        <LogoChip src={logoUrl} alt={`${member.business_name} logo`} size={72} className="md:hidden" />
        <LogoChip src={logoUrl} alt={`${member.business_name} logo`} size={104} className="hidden md:flex" />
        <div className="flex flex-1 flex-col pb-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="font-display text-2xl text-ink md:text-3xl">{member.business_name}</h1>
            <span className="rounded-pill bg-canvas-2 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-ink-muted">
              {MEMBER_TYPE_BADGE[member.member_type]}
            </span>
          </div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink-muted">
            <span>{member.city}, {member.state}</span>
            {/* This business's other published locations (same
                business_name, different row -- see member-profile.server.ts's
                nextLocation for why there's no formal link between them).
                Cycles through the rest one at a time, wrapping back to the
                first after the last. */}
            {nextLocation && (
              <Link
                to="/members/$slug"
                params={{ slug: nextLocation.slug }}
                search={search}
                className="inline-flex min-h-11 items-center gap-0.5 font-medium text-brand-bright hover:underline"
              >
                Also in {nextLocation.city} <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </p>
        </div>
      </div>
      {/* Spec, "Empty and error states": "No tagline -> Line omitted, name
          and badge close up." Omitting the element entirely (rather than
          rendering an empty <p>) is what makes that close-up happen. */}
      {member.tagline && (
        <p className="mt-3 px-4 text-base italic text-ink-muted md:px-6">{member.tagline}</p>
      )}
    </div>
  );
}
