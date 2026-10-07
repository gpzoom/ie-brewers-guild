import type { EventHostStatus } from "@/lib/supabase/types";
import type { GuestInfo, ProfileEvent } from "@/lib/events/guest-display";

/**
 * The taproom's "Guild members at your taproom" box (artboard GV1) and the
 * Food page preview: its linked stops, hidden ones included. Pure; the
 * server function (guest-stops.server.ts) reads the rows.
 */
export type GuestStopRow = {
  eventId: string;
  guestName: string;
  guestSlug: string;
  tag: string;
  food: boolean;
  title: string | null;
  /** A rescheduled stop's new start. */
  startsAt: string;
  /** Null for a rescheduled stop (only its new start is known) or no end. */
  endsAt: string | null;
  allDay: boolean;
  status: EventHostStatus;
};

export type GuestStopEvent = {
  id: string;
  member_id: string;
  title: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  overlay_status: string | null;
  overlay_starts_at: string | null;
  is_hidden: boolean;
};

export const GUEST_STOP_EVENT_COLUMNS =
  "id, member_id, title, starts_at, ends_at, all_day, overlay_status, overlay_starts_at, is_hidden";

const DEFAULT_LENGTH_MS = 2 * 3600 * 1000;

export function buildGuestStopRows(args: {
  links: Array<{ event_id: string; status: EventHostStatus }>;
  events: GuestStopEvent[];
  guests: Map<string, GuestInfo>;
  now: Date;
}): GuestStopRow[] {
  const status = new Map(args.links.map((l) => [l.event_id, l.status]));
  const rows: GuestStopRow[] = [];
  for (const e of args.events) {
    const linkStatus = status.get(e.id);
    const guest = args.guests.get(e.member_id);
    if (!linkStatus || !guest) continue;
    // Stops that show nowhere aren't listed: the member canceled, postponed or hid them.
    if (e.is_hidden || e.overlay_status === "canceled" || e.overlay_status === "postponed") continue;
    const rescheduled = e.overlay_status === "rescheduled" && Boolean(e.overlay_starts_at);
    const startsAt = rescheduled ? (e.overlay_starts_at as string) : e.starts_at;
    const endsAt = rescheduled ? null : e.ends_at;
    const end = e.all_day
      ? new Date(startsAt).getTime() + 24 * 3600 * 1000
      : endsAt
        ? new Date(endsAt).getTime()
        : new Date(startsAt).getTime() + DEFAULT_LENGTH_MS;
    if (end <= args.now.getTime()) continue;
    rows.push({
      eventId: e.id,
      guestName: guest.name,
      guestSlug: guest.slug,
      tag: guest.tag,
      food: guest.food,
      title: e.title?.trim() || null,
      startsAt,
      endsAt,
      allDay: e.all_day,
      status: linkStatus,
    });
  }
  return rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** A row as a food-week slot, for the Food page's preview. */
export function toGuestSlot(row: GuestStopRow): ProfileEvent {
  return {
    id: row.eventId,
    member_id: "",
    calendar_connection_id: null,
    source: "manual",
    kind: "event",
    external_event_id: null,
    title: row.title,
    description: null,
    starts_at: row.startsAt,
    ends_at: row.endsAt,
    all_day: row.allDay,
    venue_name: null,
    city: null,
    address: null,
    overlay_status: null,
    overlay_starts_at: null,
    overlay_note: null,
    overlay_set_at: null,
    is_hidden: false,
    guest: { name: row.guestName, slug: row.guestSlug, tag: row.tag, food: row.food },
  };
}
