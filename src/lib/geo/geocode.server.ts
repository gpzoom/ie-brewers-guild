import { createServerOnlyFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  buildGeocodeAddress,
  geocodeAddress,
  needsGeocode,
  type AddressFields,
  type AddressSnapshot,
} from "@/lib/geo/geocode";

/**
 * After a profile is published: look up map coordinates for its street
 * address and save them (plus the postal code Google returns) on the live
 * member row, so the public /members map gets a pin.
 *
 * Best-effort by design -- it never throws, so it can't fail a publish that
 * already succeeded. It writes with the service-role client (members'
 * live rows are locked for member roles), only to the one member just
 * published, only while that row is still published with the same street
 * address it looked up, and only when needsGeocode() says so (a street
 * address that's new/changed, or coordinates that are missing).
 *
 * The Google key is the Worker secret GOOGLE_GEOCODING_API_KEY (a
 * server-side key with the Geocoding API enabled). Without it this logs
 * once per publish and does nothing.
 */

const ADDRESS_COLUMNS = "street_address, city, state, latitude, longitude";

type GeoEnv = { GOOGLE_GEOCODING_API_KEY?: string };

const getGeocodingKey = createServerOnlyFn(async (): Promise<string | null> => {
  const { env } = await import("cloudflare:workers");
  return (env as GeoEnv).GOOGLE_GEOCODING_API_KEY?.trim() || null;
});

/** The live row's address as it stands now -- call BEFORE publishing (any client that can read the row). */
export async function readAddressSnapshot(
  supabase: SupabaseClient,
  memberId: string,
): Promise<AddressFields | null> {
  try {
    const { data } = await supabase
      .from("members")
      .select(ADDRESS_COLUMNS)
      .eq("id", memberId)
      .maybeSingle();
    return (data as AddressFields | null) ?? null;
  } catch {
    return null;
  }
}

export async function geocodeMemberAfterPublish(
  memberId: string,
  before: AddressFields | null,
): Promise<void> {
  try {
    const service = await getSupabaseServiceRoleClient();
    const { data, error } = await service
      .from("members")
      .select(`status, ${ADDRESS_COLUMNS}`)
      .eq("id", memberId)
      .maybeSingle();
    if (error || !data) return;
    const after = data as AddressSnapshot & { status: string };
    if (after.status !== "published" || !needsGeocode(before, after)) return;

    const address = buildGeocodeAddress(after);
    if (!address) return;

    const apiKey = await getGeocodingKey();
    if (!apiKey) {
      console.warn("geocode: GOOGLE_GEOCODING_API_KEY is not set; skipping map pin lookup.");
      return;
    }

    const result = await geocodeAddress({ address, apiKey });
    if (!result) {
      console.warn(`geocode: no usable result for member ${memberId}; no map pin.`);
      return;
    }

    const patch: Record<string, unknown> = { latitude: result.lat, longitude: result.lng };
    if (result.postalCode) patch.postal_code = result.postalCode;

    const { error: updateError } = await service
      .from("members")
      .update(patch)
      .eq("id", memberId)
      .eq("status", "published")
      // Don't pin a newer address with this lookup's coordinates.
      .eq("street_address", after.street_address as string);
    if (updateError) console.warn(`geocode: couldn't save coordinates: ${updateError.message}`);
  } catch (err) {
    console.warn(`geocode: lookup failed for member ${memberId}: ${(err as Error).message}`);
  }
}
