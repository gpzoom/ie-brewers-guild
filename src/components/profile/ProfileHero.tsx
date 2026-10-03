import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { MemberImage } from "@/components/profile/MemberImage";
import { LogoChip } from "@/components/profile/LogoChip";
import { cropForWiderFrame } from "@/lib/media/crop";
import { logoBackgroundColor } from "@/lib/members/logo-background";
import { COVER_ASPECT, DESKTOP_COVER_ASPECT } from "@/lib/media/crop-interaction";
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

// Producers carry no badge on the artboard (D/L show "[CITY], CA ·
// Member since [YEAR]"); mobile and Allied Member profiles get the small
// dark pill (E/V) in place of the city.
const MEMBER_TYPE_BADGE: Record<MemberRow["member_type"], string | null> = {
  producer: null,
  mobile: "Mobile",
  allied: "Allied Member",
};

/**
 * Shares the page's own URL: the native share sheet where the browser has
 * one (phones), otherwise copies the link and says so. Artboard L's Share
 * button; used on the phone too, in the artboards' 44px icon-button slot.
 */
function ShareButton({ memberName }: { memberName: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = window.location.href.split("#")[0];
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: memberName, url });
      } catch {
        // Dismissed share sheet -- nothing to do.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked -- the address bar still has the link.
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={copied ? "Link copied" : "Share this profile"}
      className="relative mb-[3px] flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] border border-canvas-border bg-white text-ink-muted hover:border-ink-subtle md:mb-1.5 md:h-[46px] md:w-[46px] md:rounded-[10px]"
    >
      <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M9 12V2.5M5.5 6 9 2.5 12.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.5 11v3.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {copied && (
        <span
          role="status"
          className="absolute right-0 top-full mt-1.5 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] text-canvas"
        >
          Link copied
        </span>
      )}
    </button>
  );
}

/**
 * The cover band, logo chip, name/badge, and tagline (artboards D/E/V on
 * the phone, L on desktop). The cover is 2.5:1 on the phone and 4:1 from
 * md up; the desktop band is a derived crop of the member's own stored
 * rectangle (see this plan's Decisions section).
 */
export function ProfileHero({ member, coverUrl, logoUrl, nextLocation, search }: ProfileHeroProps) {
  const badge = MEMBER_TYPE_BADGE[member.member_type];
  const logoBackground = logoBackgroundColor(member.logo_background, member.theme);
  const memberSince = member.member_since_year ? `Member since ${member.member_since_year}` : null;

  // The pull-up exists so the LOGO overlaps the cover's lower edge (spec,
  // "Profile hero and theme"), by 30px (40px on desktop) as drawn. It sits
  // on the chip itself, anchored to the row's top (self-start), not on the
  // row: the chip always overlaps the cover by the same amount, while the
  // name column starts at the cover's edge and grows downward -- so a
  // business name that wraps to two or three lines never runs up into the
  // cover photo. LogoChip renders nothing for a null src (most launch
  // profiles have no logo yet); the row then just gets a little top padding.
  const heroRowClassName = logoUrl ? "flex items-end gap-3 md:gap-5" : "flex items-end gap-3 pt-2 md:gap-5 md:pt-3";

  return (
    <>
      {/* Two renders, one per breakpoint (only the visible one loads -- the
          hidden <img> is display:none and lazy). The desktop band is wider
          than the 2.5:1 the member positioned in the editor, so it gets a
          derived crop that keeps their positioning instead of the stored
          one stretched and re-centered by object-cover. */}
      <MemberImage
        src={coverUrl}
        crop={member.cover_crop}
        alt={`${member.business_name} cover photo`}
        theme={member.theme}
        aspectClassName="aspect-[2.5/1]"
        className="rounded-none border-b border-canvas-border md:hidden"
      />
      <MemberImage
        src={coverUrl}
        crop={member.cover_crop ? cropForWiderFrame(member.cover_crop, COVER_ASPECT, DESKTOP_COVER_ASPECT) : null}
        alt={`${member.business_name} cover photo`}
        theme={member.theme}
        aspectClassName="aspect-[4/1]"
        className="hidden rounded-none border-b border-canvas-border md:block"
      />

      <div className="flex flex-col gap-[11px] px-4 md:gap-7 md:px-10">
        <div className={heroRowClassName}>
          <LogoChip
            src={logoUrl}
            alt={`${member.business_name} logo`}
            size={68}
            background={logoBackground}
            className="relative -mt-[30px] self-start rounded-2xl border-[3px] border-canvas md:hidden"
          />
          <LogoChip
            src={logoUrl}
            alt={`${member.business_name} logo`}
            size={104}
            background={logoBackground}
            className="relative -mt-10 hidden self-start rounded-[22px] border-4 border-canvas p-2.5 md:flex"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1 pb-[3px] pt-2 md:gap-[7px] md:pb-1.5 md:pt-3">
            <h1 className="text-[23px] leading-[1.08] text-ink md:text-[34px] md:leading-[1.05] md:tracking-[-0.015em]">
              {member.business_name}
            </h1>
            <p className="flex flex-wrap items-center gap-x-[7px] gap-y-0.5 text-xs text-ink-muted md:text-sm">
              {badge ? (
                <span className="rounded-pill bg-ink px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-canvas">
                  {badge}
                </span>
              ) : null}
              <span>
                {badge ? null : `${member.city}, ${member.state}`}
                {!badge && memberSince ? " · " : ""}
                {memberSince}
              </span>
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
                  // 44px tall hit area (spec) without growing the meta line:
                  // the vertical padding is canceled by an equal negative margin.
                  className="-my-[13px] inline-flex items-center gap-0.5 py-[13px] font-medium text-brand hover:text-brand-hover"
                >
                  Also in {nextLocation.city} <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </p>
          </div>
          <ShareButton memberName={member.business_name} />
        </div>

        {/* Spec, "Empty and error states": "No tagline -> Line omitted, name
            and badge close up." Omitting the element entirely (rather than
            rendering an empty <p>) is what makes that close-up happen. */}
        {member.tagline && (
          <p className="text-pretty text-sm leading-normal text-[#3A332C] md:max-w-[720px] md:text-[17px]">
            {member.tagline}
          </p>
        )}
      </div>
    </>
  );
}
