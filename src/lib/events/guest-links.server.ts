import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { decideGuestLinks, type ExistingLink, type GuestStop } from "@/lib/events/guest-links";
import type { HostCandidate } from "@/lib/members/mobile-stops";

const STOP_COLUMNS = "id, member_id, venue_name, address, city, starts_at, ends_at, all_day, overlay_status, overlay_starts_at";

/**
 * Relinks Mobile members' upcoming stops to the Guild taprooms they're at
 * (guest-links.ts decides). Service role: links are written only here.
 * Never throws -- a save or sync that succeeded must not fail because of it.
 */
export async function relinkGuestStops(scope: { memberId?: string } = {}): Promise<void> {
  try {
    const db = await getSupabaseServiceRoleClient();
    let mobileQuery = db.from("members").select("id").eq("status", "published").eq("member_type", "mobile");
    if (scope.memberId) mobileQuery = mobileQuery.eq("id", scope.memberId);
    const { data: mobiles, error: mErr } = await mobileQuery;
    if (mErr) throw mErr;
    const mobileIds = (mobiles ?? []).map((m) => m.id as string);
    if (mobileIds.length === 0) return;

    const [{ data: hostRows, error: hErr }, { data: stopRows, error: sErr }] = await Promise.all([
      db.from("members").select("id, slug, business_name, city, street_address").eq("status", "published").eq("member_type", "producer"),
      db.from("events").select(STOP_COLUMNS).in("member_id", mobileIds).eq("kind", "event"),
    ]);
    if (hErr) throw hErr;
    if (sErr) throw sErr;
    const stops = (stopRows ?? []) as GuestStop[];
    const hosts: HostCandidate[] = (hostRows ?? []).map((h) => ({
      id: h.id as string,
      slug: h.slug as string,
      name: h.business_name as string,
      city: (h.city as string | null) ?? "",
      street: (h.street_address as string | null) ?? null,
    }));
    const ids = stops.map((s) => s.id);
    const { data: existingRows, error: eErr } = ids.length
      ? await db.from("event_hosts").select("event_id, host_member_id, status").in("event_id", ids)
      : { data: [], error: null };
    if (eErr) throw eErr;

    const { upserts, deletes } = decideGuestLinks({
      stops,
      hosts,
      existing: (existingRows ?? []) as ExistingLink[],
      now: new Date(),
    });
    if (upserts.length) {
      const { error } = await db
        .from("event_hosts")
        .upsert(
          upserts.map((u) => ({ ...u, status_set_by_user_id: null, updated_at: new Date().toISOString() })),
          { onConflict: "event_id" },
        );
      if (error) throw error;
    }
    if (deletes.length) {
      const { error } = await db.from("event_hosts").delete().in("event_id", deletes);
      if (error) throw error;
    }
  } catch (err) {
    console.error("relinkGuestStops failed", err);
  }
}
