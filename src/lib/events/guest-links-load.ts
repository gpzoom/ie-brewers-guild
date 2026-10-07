import type { SupabaseClient } from "@supabase/supabase-js";
import { upcomingStopsFilter, type ExistingLink, type GuestStop, type LinkHost } from "@/lib/events/guest-links";

const STOP_COLUMNS =
  "id, member_id, title, venue_name, address, city, starts_at, ends_at, all_day, overlay_status, overlay_starts_at, is_hidden";
const LINK_COLUMNS =
  "event_id, host_member_id, status, guest_name, title, notified_starts_at, notified_ends_at, notified_all_day, cancel_notified";

/**
 * The linker's inputs (guest-links.server.ts passes the service-role
 * client): published Mobile members' stops in the linking window and their
 * names, every published producer with its "Ask me first" setting, and
 * those stops' existing links with what each taproom was last told. Null
 * when there's no published Mobile member in scope. Throws on a failed read.
 */
export async function loadLinkerInputs(
  db: SupabaseClient,
  scope: { memberId?: string },
  now: Date,
): Promise<{ stops: GuestStop[]; hosts: LinkHost[]; existing: ExistingLink[]; guestNames: Map<string, string> } | null> {
  let mobileQuery = db.from("members").select("id, business_name").eq("status", "published").eq("member_type", "mobile");
  if (scope.memberId) mobileQuery = mobileQuery.eq("id", scope.memberId);
  const { data: mobiles, error: mErr } = await mobileQuery;
  if (mErr) throw mErr;
  const mobileRows = (mobiles ?? []) as Array<{ id: string; business_name: string }>;
  if (mobileRows.length === 0) return null;
  const guestNames = new Map(mobileRows.map((m) => [m.id, m.business_name]));

  const [{ data: hostRows, error: hErr }, { data: stopRows, error: sErr }] = await Promise.all([
    db
      .from("members")
      .select("id, slug, business_name, city, street_address, guest_stops_mode")
      .eq("status", "published")
      .eq("member_type", "producer"),
    db
      .from("events")
      .select(STOP_COLUMNS)
      .in("member_id", [...guestNames.keys()])
      .eq("kind", "event")
      .or(upcomingStopsFilter(now)),
  ]);
  if (hErr) throw hErr;
  if (sErr) throw sErr;
  const stops = (stopRows ?? []) as GuestStop[];
  const hosts: LinkHost[] = ((hostRows ?? []) as Array<Record<string, string | null>>).map((h) => ({
    id: h.id as string,
    slug: h.slug as string,
    name: h.business_name as string,
    city: h.city ?? "",
    street: h.street_address ?? null,
    mode: h.guest_stops_mode === "ask" ? "ask" : "show",
  }));
  const ids = stops.map((s) => s.id);
  const { data: existingRows, error: eErr } = ids.length
    ? await db.from("event_hosts").select(LINK_COLUMNS).in("event_id", ids)
    : { data: [], error: null };
  if (eErr) throw eErr;
  return { stops, hosts, existing: (existingRows ?? []) as ExistingLink[], guestNames };
}
