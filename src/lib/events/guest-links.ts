import { matchHost, type HostCandidate } from "@/lib/members/mobile-stops";
import type { EventHostStatus } from "@/lib/supabase/types";

/**
 * Which Mobile members' stops are at which Guild taproom
 * (docs/superpowers/specs/2026-10-07-guild-members-at-taprooms-design.md).
 * Pure: the server wrapper (guest-links.server.ts) loads the inputs and
 * writes the result with the service role. Same matching as the Members
 * map (matchHost). A hide is kept while the stop stays at that taproom;
 * a move to another taproom starts shown there.
 */
export const GUEST_LINK_DAYS = 60;
const DEFAULT_LENGTH_MS = 2 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

export type GuestStop = {
  id: string;
  member_id: string;
  venue_name: string | null;
  address: string | null;
  city: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  overlay_status: string | null;
  overlay_starts_at: string | null;
};

export type ExistingLink = { event_id: string; host_member_id: string; status: EventHostStatus };

/** A rescheduled stop counts by its new start time (the same rule as stopStart in mobile-stops). */
function startOf(s: GuestStop): number {
  return new Date(s.overlay_status === "rescheduled" && s.overlay_starts_at ? s.overlay_starts_at : s.starts_at).getTime();
}

function inWindow(s: GuestStop, now: Date): boolean {
  const start = startOf(s);
  const end = s.all_day
    ? start + DAY_MS
    : s.ends_at && s.overlay_status !== "rescheduled"
      ? Math.max(new Date(s.ends_at).getTime(), start)
      : start + DEFAULT_LENGTH_MS;
  return end > now.getTime() && start <= now.getTime() + GUEST_LINK_DAYS * DAY_MS;
}

export function decideGuestLinks(args: {
  stops: GuestStop[];
  hosts: HostCandidate[];
  existing: ExistingLink[];
  now: Date;
}): { upserts: Array<{ event_id: string; host_member_id: string; status: "shown" }>; deletes: string[] } {
  const existing = new Map(args.existing.map((l) => [l.event_id, l]));
  const upserts: Array<{ event_id: string; host_member_id: string; status: "shown" }> = [];
  const deletes: string[] = [];
  for (const s of args.stops) {
    if (!inWindow(s, args.now)) continue;
    const host = matchHost(s, args.hosts);
    const before = existing.get(s.id);
    if (!host) {
      if (before) deletes.push(s.id);
      continue;
    }
    if (before && before.host_member_id === host.id) continue;
    upserts.push({ event_id: s.id, host_member_id: host.id, status: "shown" });
  }
  return { upserts, deletes };
}
