/**
 * Server-side Google Places API (New) client for "Fill from Google" and the
 * Join form: a text search (up to 5 candidates) and a place-details fetch.
 * The key (GOOGLE_PLACES_API_KEY, else GOOGLE_GEOCODING_API_KEY) is a Worker secret and is never echoed in
 * errors. `fetchImpl` is injectable for tests.
 */

import { INLAND_EMPIRE_BIAS } from "@/lib/geo/places-address";
import type { GooglePlaceDetails } from "@/lib/google/place-profile";

export type PlaceCandidate = { placeId: string; name: string; address: string };

export const SEARCH_FIELD_MASK = "places.id,places.displayName,places.formattedAddress";
export const DETAILS_FIELD_MASK =
  "id,displayName,addressComponents,formattedAddress,location,nationalPhoneNumber,websiteUri,regularOpeningHours,editorialSummary,businessStatus";

const BASE = "https://places.googleapis.com/v1";

async function getKey(): Promise<string> {
  const { env } = await import("cloudflare:workers");
  const vars = env as unknown as Record<string, string | undefined>;
  // A dedicated Places key wins; otherwise the existing server-side geocoding
  // key (Places API (New) is enabled on it). Never the public VITE_ browser key.
  const key = vars.GOOGLE_PLACES_API_KEY?.trim() || vars.GOOGLE_GEOCODING_API_KEY?.trim();
  if (!key) throw new Error("Google lookup isn't set up");
  return key;
}

export async function searchPlaces(
  name: string,
  city: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlaceCandidate[]> {
  const key = await getKey();
  const res = await fetchImpl(`${BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": SEARCH_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: `${name} ${city}`.trim(),
      maxResultCount: 5,
      locationBias: {
        circle: {
          center: { latitude: INLAND_EMPIRE_BIAS.center.lat, longitude: INLAND_EMPIRE_BIAS.center.lng },
          radius: INLAND_EMPIRE_BIAS.radius,
        },
      },
    }),
  });
  if (!res.ok) throw new Error("Google lookup failed");
  const data = (await res.json()) as {
    places?: { id?: string; displayName?: { text?: string }; formattedAddress?: string }[];
  };
  return (data.places ?? [])
    .filter((p) => p.id)
    .slice(0, 5)
    .map((p) => ({ placeId: p.id as string, name: p.displayName?.text ?? "", address: p.formattedAddress ?? "" }));
}

export async function getPlaceDetails(
  placeId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GooglePlaceDetails> {
  const key = await getKey();
  const res = await fetchImpl(`${BASE}/places/${encodeURIComponent(placeId)}`, {
    method: "GET",
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAILS_FIELD_MASK },
  });
  if (!res.ok) throw new Error("Google lookup failed");
  return (await res.json()) as GooglePlaceDetails;
}
