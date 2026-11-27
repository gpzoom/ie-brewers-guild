import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { MEMBER_PATH, type CommunityEvent } from "@/lib/home/sections";

/** One community event graphic, linked if it has a link (docs/superpowers/specs/2026-11-14-homepage-sections-design.md). */
export function ImageAnnouncement({
  section,
}: {
  section: CommunityEvent;
}) {
  const img = (
    <img
      src={section.imageUrl}
      alt={section.alt}
      width={section.width ?? undefined}
      height={section.height ?? undefined}
      loading="lazy"
      className="h-auto w-full rounded-2xl"
    />
  );
  if (!section.link) return img;
  return section.link.external ? (
    <a href={section.link.href} target="_blank" rel="noopener noreferrer" className="block">
      {img}
    </a>
  ) : (
    <InternalLink href={section.link.href}>{img}</InternalLink>
  );
}

/** A link to a page on this site, through the router (no full page reload). */
function InternalLink({ href, children }: { href: string; children: ReactNode }) {
  const member = MEMBER_PATH.exec(href);
  if (member) {
    return (
      <Link to="/members/$slug" params={{ slug: member[1] }} className="block">
        {children}
      </Link>
    );
  }
  // resolveLink only lets INTERNAL_PAGES paths through, and each is a route.
  return (
    <Link to={href as "/about"} className="block">
      {children}
    </Link>
  );
}
