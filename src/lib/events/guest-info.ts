import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventHostStatus, EventRow } from "@/lib/supabase/types";
import { upcomingStopsFilter } from "@/lib/events/guest-links";
import { buildGuestStopRows, type GuestStopRow } from "@/lib/events/guest-stops";
import { mobileTagFor, type MobileCategory } from "@/lib/members/mobile-category";
import { guestEventsForHost, isFoodCategory, type GuestInfo, type ProfileEvent } from "@/lib/events/guest-display";

/**
 * Reads for Guild Mobile members at taprooms
 * (docs/superpowers/specs/2026-10-07-guild-members-at-taprooms-design.md),
 * shared by the taproom's profile, the homepage and the Events-page box.
 * Takes the caller's client: RLS decides what each viewer may read.
 */

/** Each published Mobile member's name, slug, card tag and food flag, by member id. */
export async function loadGuestInfo(supabase: SupabaseClient, memberIds: string[]): Promise<Map<string, GuestInfo>> {
  const out = new Map<string, GuestInfo>();
  const ids = [...new Set(memberIds)];
  if (ids.length === 0) return out;
  const [members, links, categories] = await Promise.all([
    supabase.from("members").select("id, slug, business_name").in("id", ids).eq("status", "published").eq("member_type", "mobile"),
    supabase.from("member_categories").select("member_id, category_id").in("member_id", ids),
    supabase.from("categories").select("id, name, slug, sort_order").eq("member_type", "mobile"),
  ]);
  const byId = new Map(((categories.data ?? []) as Array<MobileCategory & { id: string }>).map((c) => [c.id, c]));
  const catsByMember = new Map<string, MobileCategory[]>();
  for (const link of (links.data ?? []) as Array<{ member_id: string; category_id: string }>) {
    const c = byId.get(link.category_id);
    if (!c) continue;
    const list = catsByMember.get(link.member_id) ?? [];
    list.push({ name: c.name, slug: c.slug, sort_order: c.sort_order });
    catsByMember.set(link.member_id, list);
  }
  for (const m of (members.data ?? []) as Array<{ id: string; slug: string; business_name: string }>) {
    const cats = catsByMember.get(m.id) ?? [];
    out.set(m.id, { name: m.business_name, slug: m.slug, tag: mobileTagFor(cats), food: isFoodCategory(cats) });
  }
  return out;
}

const LINKED_EVENT_COLUMNS =
  "id, member_id, calendar_connection_id, source, kind, external_event_id, title, description, starts_at, ends_at, all_day, venue_name, city, address, overlay_status, overlay_starts_at, overlay_note, overlay_set_at, is_hidden";

/**
 * A taproom's links joined to their upcoming events, in one query bounded
 * by date (links are never pruned, so they pile up over the years). The
 * inner join also drops links to events the viewer can't read.
 */
async function loadUpcomingLinks(
  supabase: SupabaseClient,
  hostMemberId: string,
  now: Date,
  onlyShown: boolean,
): Promise<Array<{ status: EventHostStatus; event: EventRow }>> {
  let query = supabase
    .from("event_hosts")
    .select(`event_id, status, events!inner(${LINKED_EVENT_COLUMNS})`)
    .eq("host_member_id", hostMemberId);
  if (onlyShown) query = query.eq("status", "shown");
  const { data, error } = await query.or(upcomingStopsFilter(now), { referencedTable: "events" });
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{ status: EventHostStatus; events: EventRow | EventRow[] }>).flatMap((row) => {
    const event = Array.isArray(row.events) ? row.events[0] : row.events;
    return event ? [{ status: row.status, event }] : [];
  });
}

/**
 * The Guild members' stops a taproom shows: its shown links (filtered here
 * too, since the host's own people can read hidden ones), their events and
 * guests, minus canceled, postponed and hidden stops.
 */
export async function loadGuestEventsForHost(
  supabase: SupabaseClient,
  hostMemberId: string,
  now: Date = new Date(),
): Promise<ProfileEvent[]> {
  const links = await loadUpcomingLinks(supabase, hostMemberId, now, true);
  if (links.length === 0) return [];
  const guests = await loadGuestInfo(supabase, links.map((l) => l.event.member_id));
  return guestEventsForHost(
    links.flatMap(({ event }) => {
      const guest = guests.get(event.member_id);
      return guest ? [{ event, guest }] : [];
    }),
  );
}

/** The taproom's Events box (GV1): every upcoming link, hidden ones included. */
export async function loadGuestStopRows(supabase: SupabaseClient, hostMemberId: string, now: Date): Promise<GuestStopRow[]> {
  const links = await loadUpcomingLinks(supabase, hostMemberId, now, false);
  if (links.length === 0) return [];
  const guests = await loadGuestInfo(supabase, links.map((l) => l.event.member_id));
  return buildGuestStopRows({
    links: links.map((l) => ({ event_id: l.event.id, status: l.status })),
    events: links.map((l) => l.event),
    guests,
    now,
  });
}

/** A Mobile member's own stops that a Guild taproom shows: their page links only these (Part 2). */
export async function loadShownHostsForGuest(
  supabase: SupabaseClient,
  guestMemberId: string,
  now: Date,
): Promise<Map<string, { name: string; slug: string }>> {
  const { data, error } = await supabase
    .from("event_hosts")
    .select("event_id, events!inner(member_id), host:members!event_hosts_host_member_id_fkey(slug, business_name)")
    .eq("status", "shown")
    .eq("events.member_id", guestMemberId)
    .or(upcomingStopsFilter(now), { referencedTable: "events" });
  if (error) throw error;
  const out = new Map<string, { name: string; slug: string }>();
  for (const row of (data ?? []) as unknown as Array<{ event_id: string; host: { slug: string; business_name: string } | Array<{ slug: string; business_name: string }> | null }>) {
    const host = Array.isArray(row.host) ? row.host[0] : row.host;
    if (host) out.set(row.event_id, { name: host.business_name, slug: host.slug });
  }
  return out;
}
