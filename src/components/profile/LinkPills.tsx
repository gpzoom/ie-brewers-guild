import type { MemberLinkRow } from "@/lib/supabase/types";
import { isHttpUrl } from "@/lib/links/url-safety";
import { SectionLabel } from "@/components/profile/SectionLabel";

type LinkPillsProps = {
  links: MemberLinkRow[];
};

const LABELS: Record<MemberLinkRow["kind"], string> = {
  website: "Website",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  taplist: "Tap list",
  menu: "Menu",
  press_kit: "Press kit",
  catalog: "Catalog",
  other: "Link",
};

/**
 * Renders every configured link as a pill, real <a href> per spec's
 * tap-target rules. The "third link pill" the comparison table calls
 * out (Tap list / Press kit / Catalog) is just whichever of those three
 * kinds happens to be present -- no special-casing needed here, the
 * member only sets links relevant to their own type.
 *
 * Look: artboards D/E/V (44px white pills, no heading on the phone) and
 * L (46px pills under a "Find them" label on desktop). Pills wrap rather
 * than scroll sideways.
 */
export function LinkPills({ links }: LinkPillsProps) {
  // Render-boundary guard -- this is what actually protects every visitor,
  // regardless of how a non-http(s) `url` (e.g. `javascript:...`) got into
  // the row: existing data, a bypass of upsertMemberLink's own
  // write-boundary check (member_links.url has no DB-level scheme
  // constraint, and a member has direct RLS-scoped REST access to their
  // own rows), or a future write path (Guild-admin tool, CSV import) that
  // never runs that check at all. See url-safety.ts's isHttpUrl doc
  // comment. A link that isn't a genuine http(s) URL is skipped entirely --
  // never rendered as a clickable <a>, and not rendered as inert text
  // either, since it's either garbage or (for a freshly-added, not-yet-filled
  // link) just not ready to show yet.
  const safeLinks = links.filter((link) => isHttpUrl(link.url));
  if (safeLinks.length === 0) return null;

  return (
    <section className="flex flex-col gap-[11px]" aria-label="Links">
      <SectionLabel className="hidden lg:flex">Find them</SectionLabel>
      <ul className="flex flex-wrap gap-2 lg:gap-[9px]">
        {safeLinks.map((link) => (
          <li key={link.id}>
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex h-11 items-center rounded-pill border border-canvas-border bg-white px-[15px] text-xs font-medium text-ink hover:border-ink-subtle lg:h-[46px] lg:px-[17px] lg:text-[13px]"
            >
              {link.label ?? LABELS[link.kind]}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
