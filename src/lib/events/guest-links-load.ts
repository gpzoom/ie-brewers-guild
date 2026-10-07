import type { SupabaseClient } from "@supabase/supabase-js";
import { upcomingStopsFilter, type ExistingLink, type GuestStop } from "@/lib/events/guest-links";
import type { HostCandidate } from "@/lib/members/mobile-stops";

const STOP_COLUMNS = "id, member_id, venue_name, address, city, starts_at, ends_at, all_day, overlay_status, overlay_starts_at";

/**
 * The linker's inputs (guest-links.server.ts passes the service-role
 * client): published Mobile members' stops in the linking window, every
 * published producer, and those stops' existing links. Null when there's
 * no published Mobile member in scope. Throws on a failed read.
 */
export async function loadLinkerInputs(
  db: SupabaseClient,
  scope: { memberId?: string },
  now: Date,
): Promise<{ stops: GuestStop[]; hosts: HostCandidate[]; existing: ExistingLink[] } | null> {
  let mobileQuery = db.from("members").select("id").eq("status", "published").eq("member_type", "mobile");
  if (scope.memberId) mobileQuery = mobileQuery.eq("id", scope.memberId);
  const { data: mobiles, error: mErr } = await mobileQuery;
  if (mErr) throw mErr;
  const mobileIds = (mobiles ?? []).map((m) => m.id as string);
  if (mobileIds.length === 0) return null;

  const [{ data: hostRows, error: hErr }, { data: stopRows, error: sErr }] = await Promise.all([
    db.from("members").select("id, slug, business_name, city, street_address").eq("status", "published").eq("member_type", "producer"),
    db.from("events").select(STOP_COLUMNS).in("member_id", mobileIds).eq("kind", "event").or(upcomingStopsFilter(now)),
  ]);
  if (hErr) throw hErr;
  if (sErr) throw sErr;
  const stops = (stopRows ?? []) as GuestStop[];
  const hosts: HostCandidate[] = ((hostRows ?? []) as Array<Record<string, string | null>>).map((h) => ({
    id: h.id as string,
    slug: h.slug as string,
    name: h.business_name as string,
    city: h.city ?? "",
    street: h.street_address ?? null,
  }));
  const ids = stops.map((s) => s.id);
  const { data: existingRows, error: eErr } = ids.length
    ? await db.from("event_hosts").select("event_id, host_member_id, status").in("event_id", ids)
    : { data: [], error: null };
  if (eErr) throw eErr;
  return { stops, hosts, existing: (existingRows ?? []) as ExistingLink[] };
}
