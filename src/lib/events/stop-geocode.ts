import { needsStopGeocode, type StopEvent } from "@/lib/members/mobile-stops";

/**
 * Looks up map coordinates for mobile members' upcoming stops (Members page
 * v2). The I/O comes in as deps so this is unit tested; the cron wires the
 * real Supabase client and Google key (stop-geocode-cron.server.ts).
 * Never throws: a failed lookup is logged and retried on the next run.
 */
export async function geocodeStops(deps: {
  loadStops: () => Promise<StopEvent[]>;
  geocode: (address: string) => Promise<{ lat: number; lng: number } | null>;
  save: (id: string, patch: { latitude: number | null; longitude: number | null; geocoded_address: string }) => Promise<void>;
  now: Date;
  limit?: number;
}): Promise<{ looked: number; saved: number }> {
  const limit = deps.limit ?? 20;
  let stops: StopEvent[];
  try {
    stops = await deps.loadStops();
  } catch (err) {
    console.error("geocodeStops: couldn't load stops", err);
    return { looked: 0, saved: 0 };
  }
  const due = stops.filter((s) => needsStopGeocode(s, deps.now)).slice(0, limit);
  let saved = 0;
  for (const s of due) {
    const address = (s.address ?? "").trim();
    try {
      const found = await deps.geocode(address);
      await deps.save(s.id, { latitude: found?.lat ?? null, longitude: found?.lng ?? null, geocoded_address: address });
      saved += 1;
    } catch (err) {
      console.error(`geocodeStops: lookup failed for event ${s.id}`, err);
    }
  }
  return { looked: due.length, saved };
}
