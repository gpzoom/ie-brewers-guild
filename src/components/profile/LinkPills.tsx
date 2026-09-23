import type { MemberLinkRow } from "@/lib/supabase/types";
import { isHttpUrl } from "@/lib/links/url-safety";
import { ExternalLink } from "lucide-react";

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
    <ul className="flex flex-wrap gap-2">
      {safeLinks.map((link) => (
        <li key={link.id}>
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-canvas-border bg-canvas px-4 text-sm font-medium text-ink hover:border-brand-bright"
          >
            {link.label ?? LABELS[link.kind]} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </li>
      ))}
    </ul>
  );
}
