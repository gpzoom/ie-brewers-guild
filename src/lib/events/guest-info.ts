import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventRow } from "@/lib/supabase/types";
import type { HostCandidate } from "@/lib/members/mobile-stops";
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

/**
 * The Guild members' stops a taproom shows: its shown links (filtered here
 * too, since the host's own people can read hidden ones), their events and
 * guests, minus canceled, postponed and hidden stops.
 */
export async function loadGuestEventsForHost(supabase: SupabaseClient, hostMemberId: string): Promise<ProfileEvent[]> {
  const { data: links } = await supabase
    .from("event_hosts")
    .select("event_id")
    .eq("host_member_id", hostMemberId)
    .eq("status", "shown");
  const ids = ((links ?? []) as Array<{ event_id: string }>).map((l) => l.event_id);
  if (ids.length === 0) return [];
  const { data: events } = await supabase.from("events").select("*").in("id", ids);
  const rows = (events ?? []) as EventRow[];
  const guests = await loadGuestInfo(supabase, rows.map((e) => e.member_id));
  return guestEventsForHost(
    rows.flatMap((event) => {
      const guest = guests.get(event.member_id);
      return guest ? [{ event, guest }] : [];
    }),
  );
}

/** Every published producer as a possible host (one row per location). */
export async function loadTaproomHosts(supabase: SupabaseClient): Promise<HostCandidate[]> {
  const { data } = await supabase
    .from("members")
    .select("id, slug, business_name, city, street_address")
    .eq("status", "published")
    .eq("member_type", "producer");
  return ((data ?? []) as Array<Record<string, string | null>>).map((h) => ({
    id: h.id as string,
    slug: h.slug as string,
    name: h.business_name as string,
    city: h.city ?? "",
    street: h.street_address ?? null,
  }));
}
