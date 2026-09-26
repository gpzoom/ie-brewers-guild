import { createServerOnlyFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  buildGeocodeAddress,
  draftDataWithGeocode,
  geocodeAddress,
  needsGeocode,
  type AddressFields,
  type AddressSnapshot,
} from "@/lib/geo/geocode";

/**
 * After a profile is published: look up map coordinates for its street
 * address and save them on the live member row, so the public /members map
 * gets a pin. The ZIP Google returns is saved only where the member hasn't
 * given one. The member's draft gets the same values while it still holds
 * that address, so draft and live agree.
 *
 * Since the draft carries coordinates (a picked address suggestion saves
 * them; a hand edit clears them), this mostly runs for hand-typed addresses:
 * needsGeocode() says when.
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
type BeforeSnapshot = AddressFields & Partial<Pick<AddressSnapshot, "latitude" | "longitude">>;

type GeoEnv = { GOOGLE_GEOCODING_API_KEY?: string };

const getGeocodingKey = createServerOnlyFn(async (): Promise<string | null> => {
  const { env } = await import("cloudflare:workers");
  return (env as GeoEnv).GOOGLE_GEOCODING_API_KEY?.trim() || null;
});

/** The live row's address as it stands now -- call BEFORE publishing (any client that can read the row). */
export async function readAddressSnapshot(
  supabase: SupabaseClient,
  memberId: string,
): Promise<BeforeSnapshot | null> {
  try {
    const { data } = await supabase
      .from("members")
      .select(ADDRESS_COLUMNS)
      .eq("id", memberId)
      .maybeSingle();
    return (data as BeforeSnapshot | null) ?? null;
  } catch {
    return null;
  }
}

export async function geocodeMemberAfterPublish(
  memberId: string,
  before: BeforeSnapshot | null,
): Promise<void> {
  try {
    const service = await getSupabaseServiceRoleClient();
    const { data, error } = await service
      .from("members")
      .select(`status, postal_code, ${ADDRESS_COLUMNS}`)
      .eq("id", memberId)
      .maybeSingle();
    if (error || !data) return;
    const after = data as AddressSnapshot & { status: string; postal_code: string | null };
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
    // The member's own ZIP (now a field on Basics) wins over Google's.
    if (result.postalCode && !after.postal_code?.trim()) patch.postal_code = result.postalCode;

    const { error: updateError } = await service
      .from("members")
      .update(patch)
      .eq("id", memberId)
      .eq("status", "published")
      // Don't pin a newer address with this lookup's coordinates.
      .eq("street_address", after.street_address as string);
    if (updateError) {
      console.warn(`geocode: couldn't save coordinates: ${updateError.message}`);
      return;
    }
    await syncDraftCoordinates(service, memberId, after, result);
  } catch (err) {
    console.warn(`geocode: lookup failed for member ${memberId}: ${(err as Error).message}`);
  }
}

/**
 * Best-effort: the looked-up pin into the member's draft basics too (see
 * draftDataWithGeocode for when). Written only if the draft hasn't changed
 * since it was read (updated_at), so a save made meanwhile is never lost;
 * dirty_sections is left as it was -- this matches live, it isn't a change.
 */
async function syncDraftCoordinates(
  service: SupabaseClient,
  memberId: string,
  looked: AddressFields,
  result: { lat: number; lng: number; postalCode: string | null },
): Promise<void> {
  try {
    const { data: draft } = await service
      .from("member_drafts")
      .select("data, updated_at")
      .eq("member_id", memberId)
      .maybeSingle();
    if (!draft) return;
    const row = draft as { data: unknown; updated_at: string };
    const next = draftDataWithGeocode(row.data, looked, result);
    if (!next) return;
    const { error } = await service
      .from("member_drafts")
      .update({ data: next })
      .eq("member_id", memberId)
      .eq("updated_at", row.updated_at);
    if (error) console.warn(`geocode: couldn't update the draft's map pin: ${error.message}`);
  } catch (err) {
    console.warn(
      `geocode: draft map pin update failed for member ${memberId}: ${(err as Error).message}`,
    );
  }
}
