import { Link } from "@tanstack/react-router";
import { LogoChip } from "@/components/profile/LogoChip";
import type { DirectoryEntry } from "@/lib/directory/list-position";
import type { MemberType } from "@/lib/supabase/types";

type CrossLinkCardProps = {
  entry: DirectoryEntry | null;
  memberType: MemberType;
  logoUrl: string | null;
  /** That member's own logo tile color; null = the default ivory chip. */
  logoBackground?: string | null;
};

// Copy per type (spec, "The Guild Trail" + "Member types" comparison
// table). Never "brewery" -- the Guild takes meaderies, cideries, and
// distilleries too. (The artboards' "NEXT IN THE DIRECTORY" is the
// generic placeholder; the spec's table names the per-type copy.)
const CROSS_LINK_HEADING: Record<MemberType, string> = {
  producer: "Next on the trail",
  mobile: "Playing nearby",
  allied: "Another Allied Member",
};

/**
 * Renders on every profile regardless of type -- cross-linking is not
 * deferred, only the Trail passport/progress-strip is (spec, "The Guild
 * Trail"). Dark card, so its logo MUST sit on a light chip (LogoChip) --
 * this is the exact place the spec calls out by name. With no logo, the
 * same ivory chip carries the member's initial so the card keeps its
 * shape (artboards D/E/V/L).
 */
export function CrossLinkCard({ entry, memberType, logoUrl, logoBackground }: CrossLinkCardProps) {
  if (!entry) return null;

  const chipClass = "rounded-xl bg-canvas lg:rounded-[14px]";

  return (
    <Link
      to="/members/$slug"
      params={{ slug: entry.slug }}
      className="flex min-h-11 items-center gap-[13px] rounded-[18px] bg-[#221E18] p-[15px] hover:bg-surface-2 lg:gap-[18px] lg:rounded-[20px] lg:px-6 lg:py-5"
    >
      {logoUrl ? (
        <>
          <LogoChip src={logoUrl} alt="" size={54} background={logoBackground} className={`${chipClass} lg:hidden`} />
          <LogoChip src={logoUrl} alt="" size={64} background={logoBackground} className={`${chipClass} hidden lg:flex`} />
        </>
      ) : (
        <span
          aria-hidden="true"
          className={`${chipClass} flex h-[54px] w-[54px] shrink-0 items-center justify-center font-display text-xl text-ink-subtle lg:h-16 lg:w-16`}
        >
          {entry.businessName.trim().charAt(0)}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-[3px] lg:gap-1">
        <span className="text-[10px] uppercase tracking-[0.15em] text-[#A89D8E] lg:text-[11px]">
          {CROSS_LINK_HEADING[memberType]}
        </span>
        <span className="font-display text-[17px] font-bold normal-case tracking-normal text-canvas lg:text-xl">
          {entry.businessName}
        </span>
        <span className="text-xs text-[#A89D8E] lg:text-[13px]">{entry.city}</span>
      </div>
      <span className="text-[17px] text-[#A89D8E] lg:text-[19px]" aria-hidden="true">
        →
      </span>
    </Link>
  );
}
