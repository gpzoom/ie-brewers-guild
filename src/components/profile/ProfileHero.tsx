import { MemberImage } from "@/components/profile/MemberImage";
import { LogoChip } from "@/components/profile/LogoChip";
import type { MemberRow } from "@/lib/supabase/types";

type ProfileHeroProps = {
  member: MemberRow;
  coverUrl: string | null;
  logoUrl: string | null;
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
export function ProfileHero({ member, coverUrl, logoUrl }: ProfileHeroProps) {
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
      <div className="relative -mt-9 flex items-end gap-4 px-4 md:-mt-13 md:px-6">
        <LogoChip src={logoUrl} alt={`${member.business_name} logo`} size={72} className="md:hidden" />
        <LogoChip src={logoUrl} alt={`${member.business_name} logo`} size={104} className="hidden md:flex" />
        <div className="flex flex-1 flex-col pb-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="font-display text-2xl text-ink md:text-3xl">{member.business_name}</h1>
            <span className="rounded-pill bg-canvas-2 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-ink-muted">
              {MEMBER_TYPE_BADGE[member.member_type]}
            </span>
          </div>
          <p className="text-sm text-ink-muted">{member.city}, {member.state}</p>
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
