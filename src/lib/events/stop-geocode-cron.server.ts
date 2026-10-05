import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/geo/geocode";
import { STOP_EVENT_COLUMNS, type StopEvent } from "@/lib/members/mobile-stops";
import { geocodeStops } from "@/lib/events/stop-geocode";

/**
 * The 15-minute cron's stop lookup (Members page v2). Service-role client:
 * no user session, and it writes only latitude/longitude/geocoded_address
 * on published mobile members' events in the next 48 hours. Both Workers
 * (staging and production share the database) run it; a stop already
 * looked up for its address is skipped, so the worst case is one duplicate
 * lookup when both run at the same moment.
 */
export async function geocodeUpcomingMobileStops(): Promise<void> {
  try {
    const { env } = await import("cloudflare:workers");
    const apiKey = (env as { GOOGLE_GEOCODING_API_KEY?: string }).GOOGLE_GEOCODING_API_KEY?.trim();
    if (!apiKey) return;
    const supabase = await getSupabaseServiceRoleClient();
    const now = new Date();
    await geocodeStops({
      now,
      loadStops: async () => {
        const { data: members, error } = await supabase
          .from("members")
          .select("id")
          .eq("status", "published")
          .eq("member_type", "mobile");
        if (error) throw error;
        const ids = (members ?? []).map((m) => m.id as string);
        if (ids.length === 0) return [];
        const from = new Date(now.getTime() - 3 * 3600 * 1000).toISOString();
        const to = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();
        const { data, error: eventsError } = await supabase
          .from("events")
          .select(STOP_EVENT_COLUMNS)
          .in("member_id", ids)
          .eq("kind", "event")
          .or(`and(starts_at.gte.${from},starts_at.lte.${to}),and(overlay_starts_at.gte.${from},overlay_starts_at.lte.${to})`);
        if (eventsError) throw eventsError;
        return (data ?? []) as unknown as StopEvent[];
      },
      geocode: async (address) => {
        const r = await geocodeAddress({ address, apiKey });
        return r ? { lat: r.lat, lng: r.lng } : null;
      },
      save: async (id, patch) => {
        const { error } = await supabase.from("events").update(patch).eq("id", id);
        if (error) throw error;
      },
    });
  } catch (err) {
    console.error("geocodeUpcomingMobileStops failed", err);
  }
}
