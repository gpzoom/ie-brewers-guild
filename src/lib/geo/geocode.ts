/**
 * Address -> map coordinates via the Google Geocoding API, for the public
 * members map. Pure pieces (address building, "does this need a lookup?",
 * response parsing) plus one network call with `fetch` injectable, so all
 * of it is unit-testable. The server wiring (Worker secret, service-role
 * write after publish) is in geocode.server.ts.
 */

export const GEOCODE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

export type AddressFields = {
  street_address: string | null;
  city: string | null;
  state: string | null;
};

export type AddressSnapshot = AddressFields & {
  latitude: number | string | null;
  longitude: number | string | null;
};

export type GeocodeResult = {
  lat: number;
  lng: number;
  postalCode: string | null;
  formattedAddress: string | null;
};

function clean(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

/**
 * "2060 Chicago Ave STE A17, Riverside, CA". Null without a street address
 * -- a mobile member (or anyone who left it blank) gets a card but no pin,
 * and a city-only lookup would drop a misleading pin in the middle of town.
 * The postal code is left out on purpose: when the street changes, the old
 * postal code may be stale and would pull the lookup the wrong way.
 */
export function buildGeocodeAddress(fields: AddressFields): string | null {
  const street = clean(fields.street_address);
  if (!street) return null;
  return [street, clean(fields.city), clean(fields.state)].filter(Boolean).join(", ");
}

function hasCoordinates(snapshot: Pick<AddressSnapshot, "latitude" | "longitude">): boolean {
  const ok = (v: number | string | null) =>
    v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
  return ok(snapshot.latitude) && ok(snapshot.longitude);
}

function sameAddress(a: AddressFields, b: AddressFields): boolean {
  const norm = (f: AddressFields) =>
    [f.street_address, f.city, f.state].map((v) => clean(v).toLowerCase()).join("|");
  return norm(a) === norm(b);
}

/**
 * Whether a just-published row needs a lookup: it has a street address, and
 * either has no coordinates yet or its street/city/state changed in this
 * publish. `before` is the live row just before publishing; null when that
 * isn't known, in which case only missing coordinates trigger a lookup.
 */
export function needsGeocode(before: AddressFields | null, after: AddressSnapshot): boolean {
  if (buildGeocodeAddress(after) === null) return false;
  if (!hasCoordinates(after)) return true;
  if (!before) return false;
  return !sameAddress(before, after);
}

export function buildGeocodeUrl(address: string, apiKey: string): string {
  const params = new URLSearchParams({ address, key: apiKey, region: "us" });
  return `${GEOCODE_ENDPOINT}?${params.toString()}`;
}

type GoogleGeocodeResponse = {
  status?: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number }; location_type?: string };
    address_components?: Array<{ long_name?: string; short_name?: string; types?: string[] }>;
  }>;
};

/** members.latitude/longitude are numeric(9, 6). */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * The first usable result, or null. A result Google itself only places
 * "APPROXIMATE"ly (a city or ZIP centroid, e.g. for a typo'd street) is
 * rejected: no pin beats a pin in the wrong place.
 */
export function parseGeocodeResponse(body: unknown): GeocodeResult | null {
  const response = body as GoogleGeocodeResponse | null;
  if (!response || response.status !== "OK" || !Array.isArray(response.results)) return null;
  const first = response.results[0];
  const lat = first?.geometry?.location?.lat;
  const lng = first?.geometry?.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (first.geometry?.location_type === "APPROXIMATE") return null;

  const postal = first.address_components?.find((c) => c.types?.includes("postal_code"));
  const postalCode = clean(postal?.long_name ?? postal?.short_name) || null;

  return {
    lat: round6(lat),
    lng: round6(lng),
    postalCode,
    formattedAddress: first.formatted_address ?? null,
  };
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/**
 * One lookup. Returns null when Google finds nothing usable; throws on a
 * network/HTTP/API-key error (REQUEST_DENIED, OVER_QUERY_LIMIT, ...) so the
 * caller can log why. Callers treat both as "no coordinates this time".
 */
export async function geocodeAddress(args: {
  address: string;
  apiKey: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<GeocodeResult | null> {
  const fetchImpl = args.fetchImpl ?? (fetch as unknown as FetchLike);
  const res = await fetchImpl(buildGeocodeUrl(args.address, args.apiKey), {
    signal: AbortSignal.timeout(args.timeoutMs ?? 5000),
  });
  if (!res.ok) throw new Error(`Geocoding API HTTP ${res.status}`);
  const body = (await res.json()) as GoogleGeocodeResponse;
  if (body?.status && body.status !== "OK" && body.status !== "ZERO_RESULTS") {
    throw new Error(
      `Geocoding API ${body.status}${body.error_message ? `: ${body.error_message}` : ""}`,
    );
  }
  return parseGeocodeResponse(body);
}
