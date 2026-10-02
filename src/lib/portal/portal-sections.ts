import type { MemberType } from "@/lib/supabase/types";
import type { PortalRole } from "@/lib/portal/portal-destination";
import type { CompletenessStep } from "@/lib/portal/section-completeness";

/**
 * The portal's sections (docs/member-profiles.md, "Routes" and "People and
 * permissions"; plan phase 5). Pure, so the routes, the sidebar and the
 * tests share one definition of who sees what:
 *
 *   section      owner  editor  media_events
 *   basics       yes    yes     --
 *   logo-cover   yes    yes     yes       (Logo, Photos & Cover; a Photos & events
 *                                          editor sees its Gallery and Carousel only)
 *   events       yes    yes     yes
 *   food         yes    yes     --        (Producers only: the food truck calendar)
 *   links        yes    yes     --
 *   discount     yes    yes     --        (Allied Members only)
 *   theme        yes    yes     --
 *   people       yes    --      --
 *
 * A Guild admin editing as a member acts with owner rights, so the portal
 * shell hands them the role "owner". Hiding a section here is not the
 * protection: every write is checked again in SQL or in the Worker.
 */

export const PORTAL_SECTIONS = [
  "basics",
  "logo-cover",
  "events",
  "food",
  "links",
  "discount",
  "theme",
  "people",
] as const;
export type PortalSection = (typeof PORTAL_SECTIONS)[number];

export function isPortalSection(value: unknown): value is PortalSection {
  return typeof value === "string" && (PORTAL_SECTIONS as readonly string[]).includes(value);
}

/** Sidebar label, and the shorter one for the phone tab strip. */
export const PORTAL_SECTION_LABELS: Record<PortalSection, { label: string; short: string }> = {
  basics: { label: "Basics & hours", short: "Basics" },
  "logo-cover": { label: "Logo, Photos & Cover", short: "Photos" },
  events: { label: "Events", short: "Events" },
  food: { label: "Food", short: "Food" },
  links: { label: "Links & contact", short: "Links" },
  discount: { label: "Discount & supplies", short: "Discount" },
  theme: { label: "Theme", short: "Theme" },
  people: { label: "People", short: "People" },
};

const MEDIA_EVENTS_SECTIONS: readonly PortalSection[] = ["logo-cover", "events"];

/** Whether this viewer may open the section at all. */
export function canOpenPortalSection(
  section: PortalSection,
  viewer: { role: PortalRole; memberType: MemberType },
): boolean {
  if (section === "discount" && viewer.memberType !== "allied") return false;
  if (section === "food" && viewer.memberType !== "producer") return false;
  if (viewer.role === "media_events") return MEDIA_EVENTS_SECTIONS.includes(section);
  if (section === "people") return viewer.role === "owner";
  return true;
}

/** The sections this viewer sees, in sidebar order. */
export function portalSectionsFor(viewer: {
  role: PortalRole;
  memberType: MemberType;
}): PortalSection[] {
  return PORTAL_SECTIONS.filter((section) => canOpenPortalSection(section, viewer));
}

/** Where /portal (or a section the viewer can't open) lands them. */
export function firstPortalSection(role: PortalRole): PortalSection {
  return role === "media_events" ? "logo-cover" : "basics";
}

/**
 * Where each "Finish your profile" entry links. Hours live on Basics &
 * hours, except for a mobile member, whose "Where we'll be" is their
 * events (the portal has no separate hours page).
 */
export function sectionForCompletenessStep(
  step: CompletenessStep,
  memberType: MemberType,
): { section: PortalSection; hash?: string } {
  switch (step) {
    case "type":
    case "basics":
      return { section: "basics" };
    case "hours":
      return memberType === "mobile" ? { section: "events" } : { section: "basics", hash: "hours" };
    default:
      return { section: step };
  }
}
