import { Link } from "@tanstack/react-router";
import { LogoChip } from "@/components/profile/LogoChip";
import type { DirectoryEntry } from "@/lib/directory/list-position";
import type { MemberType } from "@/lib/supabase/types";

type CrossLinkCardProps = {
  entry: DirectoryEntry | null;
  memberType: MemberType;
  logoUrlByMemberId?: never; // deliberately not plumbed in v1 -- see note below
};

// Copy per type (spec, "The Guild Trail" + "Member types" comparison
// table). Never "brewery" -- the Guild takes meaderies, cideries, and
// distilleries too.
const CROSS_LINK_HEADING: Record<MemberType, string> = {
  producer: "Next on the trail",
  mobile: "Playing nearby",
  allied: "Another Allied Member",
};

/**
 * Renders on every profile regardless of type -- cross-linking is not
 * deferred, only the Trail passport/progress-strip is (spec, "The Guild
 * Trail"). Dark card, so any logo shown on it MUST sit on a light chip
 * (LogoChip) -- this is the exact place the spec calls out by name.
 *
 * v1 does not fetch the target member's logo (that would mean a second
 * asset lookup inside getMemberProfileData for a card that, at launch,
 * mostly points at name+city-only imported members anyway per "Most
 * profiles will be that member for a long time"). Renders name/city only
 * until a follow-up wires the logo through; the LogoChip usage above
 * documents where it plugs in once it does.
 */
export function CrossLinkCard({ entry, memberType }: CrossLinkCardProps) {
  if (!entry) return null;

  return (
    <Link
      to="/members/$slug"
      params={{ slug: entry.slug }}
      className="flex min-h-11 items-center gap-4 rounded-card bg-surface px-5 py-4 text-text hover:bg-surface-2"
    >
      <LogoChip src={null} alt="" size={56} />
      <div className="flex flex-col">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-bright">
          {CROSS_LINK_HEADING[memberType]}
        </span>
        <span className="font-display text-lg">{entry.businessName}</span>
        <span className="text-sm text-text-muted">{entry.city}</span>
      </div>
    </Link>
  );
}
