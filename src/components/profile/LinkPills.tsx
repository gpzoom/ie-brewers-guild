import type { MemberLinkRow } from "@/lib/supabase/types";
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
  if (links.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2">
      {links.map((link) => (
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
