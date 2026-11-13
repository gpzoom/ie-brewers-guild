import { getZonedNow } from "@/lib/hours/open-now";

/**
 * The homepage's "Coming up at our members" carousel (docs/member-profiles.md,
 * "Homepage"; artboards A, A2, A3). Pure: the server loader passes in the
 * rows it read, so the rules are tested without Supabase.
 *
 * - Events from published members starting within the next 14 days (and
 *   ones still going on now). Food calendar entries, hidden events, and
 *   canceled or postponed ones are left out; a rescheduled event counts at
 *   its new time.
 * - Round-robin (owner, 2026-09-28): each member's soonest event first, then
 *   everyone's second, and so on, so a taproom with weekly trivia can't fill
 *   the carousel. Within a round, soonest first. At most 24 pages.
 * - A Guild guest's stop at a taproom that the taproom also lists, starting
 *   within an hour of it, is one spot: the taproom's card, carrying the
 *   guest's own card as `alternate` (owner, 2026-11-13).
 */

export const CAROUSEL_WINDOW_DAYS = 14;
export const CAROUSEL_MAX_CARDS = 24;
/** An event with no end time is treated as running this long. */
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A guest's stop and the taproom's own event this close in start time are the same night. */
const PAIR_WINDOW_MS = 60 * 60 * 1000;

export type HomeEventMember = {
  id: string;
  slug: string;
  businessName: string;
  /** Theme hex (getMemberThemeHex). */
  themeHex: string;
  timezone: string;
  logoUrl: string | null;
  /** Logo tile color (logoBackgroundColor). */
  logoTileHex: string;
  coverAssetId: string | null;
};

export type HomeEventInputRow = {
  id: string;
  member_id: string;
  kind?: string | null;
  title: string | null;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day?: boolean | null;
  venue_name: string | null;
  city: string | null;
  overlay_status: string | null;
  overlay_starts_at: string | null;
  is_hidden: boolean;
};

export type HomeEventCard = {
  id: string;
  member: HomeEventMember;
  title: string;
  description: string | null;
  startsAt: string;
  /** Null for a rescheduled event (only its new start is known) or no end. */
  endsAt: string | null;
  allDay: boolean;
  rescheduled: boolean;
  venue: string | null;
  city: string | null;
  /**
   * A Guild Mobile member's stop at this taproom (Guild Mobile members at
   * taprooms, artboard GV4): the card is the taproom's, naming the guest.
   */
  guest?: { name: string; tag: string };
  /**
   * The same night listed by both the taproom and a Guild guest
   * (docs/superpowers/specs/2026-11-13-carousel-shared-event-alternation-design.md):
   * the guest's own card, which the carousel shows on every other pass.
   */
  alternate?: HomeEventCard;
};

/** A shown link from a Mobile member's stop to the taproom it's at, by event id. */
export type HomeEventHost = { hostMemberId: string; guest: { name: string; tag: string } };

function toCard(row: HomeEventInputRow, member: HomeEventMember): HomeEventCard {
  const rescheduled = row.overlay_status === "rescheduled" && Boolean(row.overlay_starts_at);
  return {
    id: row.id,
    member,
    title: row.title ?? row.venue_name ?? "Event",
    description: row.description?.trim() || null,
    startsAt: rescheduled ? row.overlay_starts_at! : row.starts_at,
    endsAt: rescheduled ? null : row.ends_at,
    allDay: row.all_day === true,
    rescheduled,
    venue: row.title ? row.venue_name : null,
    city: row.city,
  };
}

function isInWindow(card: HomeEventCard, now: Date, days: number): boolean {
  const start = Date.parse(card.startsAt);
  if (Number.isNaN(start)) return false;
  const end = card.endsAt ? Date.parse(card.endsAt) : start + DEFAULT_DURATION_MS;
  return end > now.getTime() && start < now.getTime() + days * DAY_MS;
}

export function selectCarouselEvents(
  rows: HomeEventInputRow[],
  members: Map<string, HomeEventMember>,
  now: Date,
  options: { days?: number; max?: number } = {},
  hostsByEventId: Map<string, HomeEventHost> = new Map(),
): HomeEventCard[] {
  const days = options.days ?? CAROUSEL_WINDOW_DAYS;
  const max = options.max ?? CAROUSEL_MAX_CARDS;

  const byMember = new Map<string, HomeEventCard[]>();
  const linkedStops: Array<{ card: HomeEventCard; row: HomeEventInputRow; hostId: string }> = [];
  for (const row of rows) {
    if ((row.kind ?? "event") !== "event") continue;
    if (row.is_hidden) continue;
    if (row.overlay_status === "canceled" || row.overlay_status === "postponed") continue;
    // A Guild member's stop at a taproom is the taproom's event: one card,
    // under the host, counted in the host's turn of the rotation.
    const link = hostsByEventId.get(row.id);
    const host = link ? members.get(link.hostMemberId) : undefined;
    const member = host ?? members.get(row.member_id);
    if (!member) continue;
    const card =
      host && link
        ? { ...toCard(row, host), title: row.title ?? link.guest.name, venue: null, guest: link.guest }
        : toCard(row, member);
    if (!isInWindow(card, now, days)) continue;
    const list = byMember.get(member.id) ?? [];
    list.push(card);
    byMember.set(member.id, list);
    if (host && link) linkedStops.push({ card, row, hostId: host.id });
  }

  // The same night listed by both: closest start times pair first, each
  // event at most once. The stop's separate card drops out.
  const linkedCards = new Set(linkedStops.map((s) => s.card));
  const candidates: Array<{ stop: (typeof linkedStops)[number]; own: HomeEventCard; diff: number }> = [];
  for (const stop of linkedStops) {
    for (const own of byMember.get(stop.hostId) ?? []) {
      if (linkedCards.has(own)) continue;
      const diff = Math.abs(Date.parse(stop.card.startsAt) - Date.parse(own.startsAt));
      if (diff <= PAIR_WINDOW_MS) candidates.push({ stop, own, diff });
    }
  }
  candidates.sort(
    (a, b) => a.diff - b.diff || Date.parse(a.own.startsAt) - Date.parse(b.own.startsAt) || a.own.id.localeCompare(b.own.id),
  );
  const used = new Set<HomeEventCard>();
  for (const { stop, own } of candidates) {
    if (used.has(stop.card) || used.has(own)) continue;
    const guestMember = members.get(stop.row.member_id);
    if (!guestMember) continue;
    own.alternate = toCard(stop.row, guestMember);
    used.add(stop.card);
    used.add(own);
    const list = byMember.get(stop.hostId)!;
    list.splice(list.indexOf(stop.card), 1);
  }

  const queues = [...byMember.values()].map((list) =>
    list.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
  );
  const result: HomeEventCard[] = [];
  for (let round = 0; result.length < max; round++) {
    const picks = queues.filter((q) => q.length > round).map((q) => q[round]);
    if (picks.length === 0) break;
    picks.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id));
    result.push(...picks.slice(0, max - result.length));
  }
  return result;
}

/**
 * Whether a shared night (a card with an `alternate`) shows the guest's
 * version at carousel position `pos`: it switches every full pass, and
 * `offset` is the visit's random start. Going back from the first slide is
 * the previous pass.
 */
export function showsAlternate(pos: number, count: number, offset: 0 | 1): boolean {
  if (count < 1) return false;
  const pass = Math.floor(pos / count);
  return (((pass + offset) % 2) + 2) % 2 === 1;
}

/** The big date on a calendar page, in the member's own time zone. */
export function calendarPageDate(
  iso: string,
  timezone: string,
): { month: string; day: string; weekday: string } {
  const date = new Date(iso);
  return {
    month: date.toLocaleDateString("en-US", { month: "long", timeZone: timezone }).toUpperCase(),
    day: date.toLocaleDateString("en-US", { day: "numeric", timeZone: timezone }),
    weekday: date.toLocaleDateString("en-US", { weekday: "long", timeZone: timezone }).toUpperCase(),
  };
}

export type GuildEvent = {
  slug: string;
  title: string;
  /** The day it happens, YYYY-MM-DD (Pacific). */
  date: string;
  location: string;
  excerpt: string;
  image: string;
  ticketsUrl: string | null;
};

/** The next Guild event from today on (Pacific), pinned first in the carousel; null if none. */
export function nextGuildEvent(events: readonly GuildEvent[], now: Date): GuildEvent | null {
  const today = getZonedNow(now, "America/Los_Angeles").date;
  return (
    [...events].filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ??
    null
  );
}
