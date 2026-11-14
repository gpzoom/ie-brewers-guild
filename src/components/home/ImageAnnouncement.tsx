import type { VisibleSection } from "@/lib/home/sections";

/** A super-admin image announcement on the homepage (docs/superpowers/specs/2026-11-14-homepage-sections-design.md). */
export function ImageAnnouncement({
  section,
}: {
  section: Extract<VisibleSection, { kind: "image" }>;
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
    <a href={section.link.href} className="block">
      {img}
    </a>
  );
}
