/**
 * Homepage sections (owner, 2026-11-14; docs/superpowers/specs/2026-11-14-homepage-sections-design.md).
 * The super admin orders the blocks below the hero (Events, Spotlight, image
 * announcements) and gives image announcements optional dates and a link.
 * Pure: the server loader passes in the rows it read, so the rules are tested
 * without Supabase.
 *
 * - Dates are whole days in America/Los_Angeles: shown from the start of
 *   `starts_on` through the end of `ends_on`; either may be null.
 * - Internal links are one of INTERNAL_PAGES or /members/<slug> of a published
 *   member; external links must be http(s). Anything else renders unlinked.
 */

export type SectionKind = "events" | "spotlight" | "image";
export type LinkKind = "none" | "internal" | "external";

/** A homepage_sections row, with its announcement image embedded. */
export type SectionRow = {
  id: string;
  kind: SectionKind;
  position: number;
  enabled: boolean;
  image_id: string | null;
  alt_text: string | null;
  link_kind: LinkKind;
  link_target: string | null;
  starts_on: string | null;
  ends_on: string | null;
  /** Selected as `image:announcement_images(image_path, alt_text, width, height)`. */
  image: {
    image_path: string;
    alt_text: string;
    width: number | null;
    height: number | null;
  } | null;
};

/** Pages an announcement may link to (each exists under src/routes). */
export const INTERNAL_PAGES: ReadonlyArray<{ path: string; label: string }> = [
  { path: "/", label: "Home" },
  { path: "/about", label: "About" },
  { path: "/members", label: "Members" },
  { path: "/events", label: "Events" },
  { path: "/jobs", label: "Jobs" },
  { path: "/news", label: "News" },
  { path: "/contact", label: "Contact" },
];

const MEMBER_PATH = /^\/members\/([a-z0-9-]+)$/;

const pacificFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date as YYYY-MM-DD in America/Los_Angeles. */
export function pacificToday(now: Date): string {
  const parts = pacificFormat.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** True from the start of `starts_on` through the end of `ends_on` (inclusive). */
export function isInDateWindow(
  row: { starts_on: string | null; ends_on: string | null },
  today: string,
): boolean {
  if (row.starts_on && today < row.starts_on) return false;
  if (row.ends_on && today > row.ends_on) return false;
  return true;
}

/** What the Settings list shows for a row; "off" wins over dates. */
export function sectionStatus(
  row: SectionRow,
  today: string,
): "showing" | "scheduled" | "ended" | "off" {
  if (!row.enabled) return "off";
  if (row.starts_on && today < row.starts_on) return "scheduled";
  if (row.ends_on && today > row.ends_on) return "ended";
  return "showing";
}

function isHttpUrl(target: string): boolean {
  if (!/^https?:\/\//i.test(target)) return false;
  try {
    new URL(target);
    return true;
  } catch {
    return false;
  }
}

function isInternalPath(target: string): boolean {
  return INTERNAL_PAGES.some((p) => p.path === target) || MEMBER_PATH.test(target);
}

/** An error message for the Settings form, or null when the link is valid. */
export function checkLink(kind: LinkKind, target: string | null): string | null {
  if (kind === "none") return null;
  if (!target || !target.trim()) return "Enter where the image should link to.";
  if (kind === "external") {
    return isHttpUrl(target) ? null : "Web addresses must start with https:// or http://.";
  }
  return isInternalPath(target) ? null : "Choose a page on this site.";
}

/** The link to render, or null (no link, invalid, or a member who isn't published). */
export function resolveLink(
  kind: LinkKind,
  target: string | null,
  publishedSlugs: ReadonlySet<string>,
): { href: string; external: boolean } | null {
  if (kind === "none" || !target) return null;
  if (kind === "external") return isHttpUrl(target) ? { href: target, external: true } : null;
  const member = MEMBER_PATH.exec(target);
  if (member) {
    return publishedSlugs.has(member[1]) ? { href: target, external: false } : null;
  }
  return INTERNAL_PAGES.some((p) => p.path === target) ? { href: target, external: false } : null;
}

export type VisibleSection =
  | { kind: "events" }
  | { kind: "spotlight" }
  | {
      kind: "image";
      id: string;
      imageUrl: string;
      alt: string;
      width: number | null;
      height: number | null;
      link: { href: string; external: boolean } | null;
    };

/** The blocks to render, in order. Bad or inactive rows are skipped. */
export function visibleSections(
  rows: SectionRow[],
  ctx: {
    today: string;
    hasSpotlight: boolean;
    publishedSlugs: ReadonlySet<string>;
    imageUrl: (path: string) => string;
  },
): VisibleSection[] {
  const out: VisibleSection[] = [];
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  for (const r of sorted) {
    if (!r.enabled) continue;
    if (r.kind === "events") {
      out.push({ kind: "events" });
    } else if (r.kind === "spotlight") {
      if (ctx.hasSpotlight) out.push({ kind: "spotlight" });
    } else if (r.kind === "image") {
      if (!r.image || !isInDateWindow(r, ctx.today)) continue;
      out.push({
        kind: "image",
        id: r.id,
        imageUrl: ctx.imageUrl(r.image.image_path),
        alt: r.alt_text?.trim() ? r.alt_text : r.image.alt_text,
        width: r.image.width,
        height: r.image.height,
        link: resolveLink(r.link_kind, r.link_target, ctx.publishedSlugs),
      });
    }
  }
  return out;
}

/** The layout when there are no rows or the read fails: spotlight (if any), then events. */
export function DEFAULT_SECTIONS(hasSpotlight: boolean): VisibleSection[] {
  return hasSpotlight ? [{ kind: "spotlight" }, { kind: "events" }] : [{ kind: "events" }];
}
