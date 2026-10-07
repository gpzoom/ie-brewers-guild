import { matchHost, type HostCandidate } from "@/lib/members/mobile-stops";
import type { EventHostStatus, GuestStopNoticeKind, GuestStopsMode } from "@/lib/supabase/types";

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
  title: string | null;
  venue_name: string | null;
  address: string | null;
  city: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  overlay_status: string | null;
  overlay_starts_at: string | null;
  is_hidden: boolean;
};

/**
 * A PostgREST .or() filter for stops that could be in the linking window:
 * starting (or rescheduled to start) from two days back -- an all-day or
 * long stop still going on -- to just past GUEST_LINK_DAYS ahead. Every
 * read of stops or links uses it, so none grows with a member's history.
 */
export function upcomingStopsFilter(now: Date): string {
  const from = new Date(now.getTime() - 2 * DAY_MS).toISOString();
  const to = new Date(now.getTime() + (GUEST_LINK_DAYS + 1) * DAY_MS).toISOString();
  return `and(starts_at.gte.${from},starts_at.lt.${to}),and(overlay_starts_at.gte.${from},overlay_starts_at.lt.${to})`;
}


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

export type LinkHost = HostCandidate & { mode: GuestStopsMode };

export type ExistingLink = {
  event_id: string;
  host_member_id: string;
  status: EventHostStatus;
  guest_name: string | null;
  title: string | null;
  notified_starts_at: string | null;
  notified_ends_at: string | null;
  notified_all_day: boolean;
  cancel_notified: boolean;
};

export type LinkWrite = Omit<ExistingLink, "guest_name" | "notified_starts_at"> & {
  guest_name: string;
  notified_starts_at: string;
};

export type NoticeWrite = {
  host_member_id: string;
  event_id: string;
  kind: GuestStopNoticeKind;
  guest_name: string;
  title: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  old_starts_at: string | null;
  old_ends_at: string | null;
};

function isLive(s: GuestStop): boolean {
  return !s.is_hidden && s.overlay_status !== "canceled" && s.overlay_status !== "postponed";
}

const sameInstant = (a: string | null, b: string | null) =>
  a === b || (a !== null && b !== null && new Date(a).getTime() === new Date(b).getTime());

export function decideGuestLinks(args: {
  stops: GuestStop[];
  hosts: LinkHost[];
  existing: ExistingLink[];
  guestNames: Map<string, string>;
  now: Date;
}): { upserts: LinkWrite[]; deletes: string[]; notices: NoticeWrite[] } {
  const existing = new Map(args.existing.map((l) => [l.event_id, l]));
  const upserts: LinkWrite[] = [];
  const deletes: string[] = [];
  const notices: NoticeWrite[] = [];
  for (const s of args.stops) {
    if (!inWindow(s, args.now)) continue;
    const host = matchHost(s, args.hosts);
    const before = existing.get(s.id);
    if (!host) {
      if (before) deletes.push(s.id); // the delete trigger tells the taproom
      continue;
    }
    const rescheduled = s.overlay_status === "rescheduled" && Boolean(s.overlay_starts_at);
    const startsAt = rescheduled ? (s.overlay_starts_at as string) : s.starts_at;
    const endsAt = rescheduled ? null : s.ends_at;
    const live = isLive(s);
    const guestName = args.guestNames.get(s.member_id) ?? before?.guest_name ?? "A Guild member";
    const title = s.title?.trim() || null;
    const note = (kind: GuestStopNoticeKind, hostId: string, old?: ExistingLink): NoticeWrite => ({
      host_member_id: hostId,
      event_id: s.id,
      kind,
      guest_name: old?.guest_name ?? guestName,
      title: old ? old.title : title,
      starts_at: old?.notified_starts_at ?? startsAt,
      ends_at: old ? old.notified_ends_at : endsAt,
      all_day: old ? old.notified_all_day : s.all_day,
      old_starts_at: null,
      old_ends_at: null,
    });
    const told = (status: EventHostStatus, cancelNotified: boolean): LinkWrite => ({
      event_id: s.id,
      host_member_id: host.id,
      status,
      guest_name: guestName,
      title,
      notified_starts_at: startsAt,
      notified_ends_at: endsAt,
      notified_all_day: s.all_day,
      cancel_notified: cancelNotified,
    });

    if (!before || before.host_member_id !== host.id) {
      if (before && (before.status === "shown" || before.status === "pending") && !before.cancel_notified && before.notified_starts_at) {
        notices.push(note("canceled", before.host_member_id, before));
      }
      const status: EventHostStatus = host.mode === "ask" ? "pending" : "shown";
      upserts.push(told(status, !live));
      if (live) notices.push(note(status === "pending" ? "request" : "new", host.id));
      continue;
    }

    const watching = before.status === "shown" || before.status === "pending";
    let cancelNotified = before.cancel_notified;
    if (watching && live && before.cancel_notified) {
      notices.push(note(before.status === "pending" ? "request" : "new", host.id));
      cancelNotified = false;
    } else if (watching && live && (!sameInstant(before.notified_starts_at, startsAt) || !sameInstant(before.notified_ends_at, endsAt))) {
      notices.push({ ...note("changed", host.id), old_starts_at: before.notified_starts_at, old_ends_at: before.notified_ends_at });
    } else if (watching && !live && !before.cancel_notified) {
      notices.push(note("canceled", host.id));
      cancelNotified = true;
    }
    const next = told(before.status, cancelNotified);
    const changed =
      next.guest_name !== before.guest_name ||
      next.title !== before.title ||
      !sameInstant(next.notified_starts_at, before.notified_starts_at) ||
      !sameInstant(next.notified_ends_at, before.notified_ends_at) ||
      next.notified_all_day !== before.notified_all_day ||
      next.cancel_notified !== before.cancel_notified;
    if (changed) upserts.push(next);
  }
  return { upserts, deletes, notices };
}
