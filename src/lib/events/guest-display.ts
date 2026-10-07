import type { EventRow } from "@/lib/supabase/types";
import type { MobileCategory } from "@/lib/members/mobile-category";
import { matchHost, normalizeBusinessName, type HostCandidate } from "@/lib/members/mobile-stops";
import { getZonedNow } from "@/lib/hours/open-now";

/**
 * How a Guild Mobile member's stop shows on the taproom's (and its own)
 * profile (docs/superpowers/specs/2026-10-07-guild-members-at-taprooms-design.md).
 * Pure.
 */
export type GuestInfo = { name: string; slug: string; tag: string; food: boolean };
export type ProfileEvent = EventRow & { guest?: GuestInfo; host?: { name: string; slug: string } };

const FOOD_SLUGS = new Set(["food-truck", "pop-up-food-vendor"]);

/** A food guest: the first category (Guild Categories order) is Food Truck or Pop-up Food Vendor -- the map icon's rule. */
export function isFoodCategory(categories: MobileCategory[]): boolean {
  const first = [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))[0];
  return Boolean(first && FOOD_SLUGS.has(first.slug));
}

/** The guest stops a taproom shows: canceled, postponed and hidden ones are skipped (their link rows stay). */
export function guestEventsForHost(rows: { event: EventRow; guest: GuestInfo }[]): ProfileEvent[] {
  return rows
    .filter(({ event }) => !event.is_hidden && event.overlay_status !== "canceled" && event.overlay_status !== "postponed")
    .map(({ event, guest }) => ({ ...event, guest }));
}

/** A rescheduled stop counts by its new start. */
export function effectiveStart(e: Pick<EventRow, "starts_at" | "overlay_status" | "overlay_starts_at">): string {
  return e.overlay_status === "rescheduled" && e.overlay_starts_at ? e.overlay_starts_at : e.starts_at;
}

function localDate(iso: string, tz: string): string {
  return getZonedNow(new Date(iso), tz).date;
}

/** No doubles: the taproom's own food-calendar entry for a Guild vendor on the same day gives way to the linked entry. */
export function dedupeFoodSlots(
  own: EventRow[],
  guests: ProfileEvent[],
  timezone: string,
): { own: EventRow[]; guests: ProfileEvent[] } {
  const guestKeys = new Set(
    guests
      .filter((g) => g.guest)
      .map((g) => `${localDate(effectiveStart(g), timezone)}|${normalizeBusinessName(g.guest!.name)}`),
  );
  return {
    own: own.filter((o) => !guestKeys.has(`${localDate(o.starts_at, timezone)}|${normalizeBusinessName(o.title ?? "")}`)),
    guests,
  };
}

/** A row's name: its own title, else the Guild guest's name, else the venue (a guest stop's venue is the taproom itself). */
export function eventDisplayTitle(e: { title: string | null; venue_name: string | null; guest?: GuestInfo }): string | null {
  return e.title ?? e.guest?.name ?? e.venue_name ?? null;
}

/**
 * A Mobile member's own stops, each with the Guild taproom it's at (live
 * matching, the map's rule): their page links there whatever the taproom
 * chose to show.
 */
export function withHosts<T extends EventRow>(events: T[], hosts: HostCandidate[]): Array<T & { host?: { name: string; slug: string } }> {
  if (hosts.length === 0) return events;
  return events.map((event) => {
    if ((event.kind ?? "event") !== "event") return event;
    const host = matchHost(event, hosts);
    return host ? { ...event, host: { name: host.name, slug: host.slug } } : event;
  });
}
