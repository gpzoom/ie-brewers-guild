/**
 * Address suggestions for the member's street address (Basics & hours):
 * Google Places API (New) autocomplete, done with the programmatic classes
 * (AutocompleteSuggestion / AutocompleteSessionToken / Place.fetchFields) so
 * the dropdown is our own. Pure pieces -- parsing a picked place into our
 * fields, mapping suggestions, the "hand edit clears the coordinates" rule,
 * ZIP validation -- plus a small session-managing lookup that takes the
 * Places library as an argument, so tests pass a fake one. The React side
 * is src/components/admin/basics/AddressAutocomplete.tsx.
 */

// ---------------------------------------------------------------------------
// The slice of google.maps.places this file uses (structural, so a test fake
// or the real library both fit)
// ---------------------------------------------------------------------------

export type PlaceAddressComponentLike = {
  longText: string | null;
  shortText: string | null;
  types: string[];
};

type LatLngLike = { lat: () => number; lng: () => number };
type FormattableTextLike = { text: string } | null;

export type PlaceLike = {
  fetchFields: (request: { fields: string[] }) => Promise<unknown>;
  addressComponents?: PlaceAddressComponentLike[] | null;
  location?: LatLngLike | null;
  formattedAddress?: string | null;
  displayName?: string | null;
};

export type PlacePredictionLike = {
  placeId: string;
  text: FormattableTextLike;
  mainText: FormattableTextLike;
  secondaryText: FormattableTextLike;
  types: string[];
  toPlace: () => PlaceLike;
};

export type PlacesLibraryLike = {
  AutocompleteSessionToken: new () => unknown;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (request: {
      input: string;
      sessionToken?: unknown;
      includedRegionCodes?: string[];
      locationBias?: unknown;
    }) => Promise<{ suggestions: Array<{ placePrediction: PlacePredictionLike | null }> }>;
  };
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Start suggesting after this many characters. */
export const MIN_QUERY_LENGTH = 3;
/** Wait this long after the last keystroke before asking Google. */
export const SUGGEST_DEBOUNCE_MS = 250;
/** Place fields read after a pick (Place Details, billed per session). */
export const PLACE_FIELDS = ["addressComponents", "location", "formattedAddress", "displayName"];
/**
 * Suggestions lean toward Inland Southern California (a 50 km circle -- the
 * largest bias radius Google allows -- around Riverside/San Bernardino),
 * without ruling out a member elsewhere in the US.
 */
export const INLAND_EMPIRE_BIAS = { center: { lat: 33.98, lng: -117.37 }, radius: 50000 };

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export type AddressSuggestion = {
  id: string;
  /** The bold first line: the business name, or "123 Main St". */
  mainText: string;
  /** The muted second line: "Redlands, CA, USA". */
  secondaryText: string;
  /** A business/landmark rather than a plain address. */
  isBusiness: boolean;
};

const ADDRESS_TYPES = new Set([
  "street_address",
  "premise",
  "subpremise",
  "route",
  "intersection",
  "geocode",
  "locality",
  "postal_code",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "sublocality",
  "neighborhood",
]);

export function isBusinessPrediction(types: readonly string[]): boolean {
  if (types.includes("establishment") || types.includes("point_of_interest")) return true;
  return types.length > 0 && !types.some((t) => ADDRESS_TYPES.has(t));
}

export function mapSuggestion(prediction: PlacePredictionLike): AddressSuggestion {
  const full = prediction.text?.text ?? "";
  const main = prediction.mainText?.text?.trim() || full;
  const secondary = prediction.secondaryText?.text?.trim() ?? "";
  return {
    id: prediction.placeId,
    mainText: main,
    secondaryText: secondary,
    isBusiness: isBusinessPrediction(prediction.types ?? []),
  };
}

// ---------------------------------------------------------------------------
// A picked place -> our fields
// ---------------------------------------------------------------------------

export type ParsedPlaceAddress = {
  /** "123 Main St Suite 100", or null when the place has no street (a city, a ZIP). */
  street_address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  /** Only with a street address: a city-centre pin would be misleading. */
  latitude: number | null;
  longitude: number | null;
};

function tidy(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function component(
  components: readonly PlaceAddressComponentLike[],
  type: string,
  which: "longText" | "shortText" = "longText",
): string | null {
  const found = components.find((c) => c.types?.includes(type));
  if (!found) return null;
  return tidy(found[which] ?? found.longText ?? found.shortText) || null;
}

/** "100" -> "Suite 100"; "Ste A17", "Unit 5", "#4" stay as Google wrote them. */
export function formatSubpremise(value: string): string {
  const v = tidy(value);
  if (!v) return "";
  if (v.startsWith("#") || /^[A-Za-z]{2,}\.?\s/.test(v)) return v;
  return `Suite ${v}`;
}

/** members.latitude/longitude are numeric(9, 6). */
export function roundCoordinate(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export function parsePlaceAddress(
  components: readonly PlaceAddressComponentLike[] | null | undefined,
  location: { lat: number; lng: number } | null | undefined,
): ParsedPlaceAddress {
  const list = components ?? [];
  const number = component(list, "street_number");
  const route = component(list, "route");
  const subpremise = component(list, "subpremise");

  let street: string | null = null;
  if (route) {
    street = [number, route].filter(Boolean).join(" ");
    if (subpremise) street = `${street} ${formatSubpremise(subpremise)}`;
  }

  const city =
    component(list, "locality") ??
    component(list, "postal_town") ??
    component(list, "sublocality_level_1") ??
    component(list, "sublocality");
  const state = component(list, "administrative_area_level_1", "shortText");
  const postal = component(list, "postal_code");

  const hasLocation =
    street !== null &&
    location != null &&
    Number.isFinite(location.lat) &&
    Number.isFinite(location.lng) &&
    Math.abs(location.lat) <= 90 &&
    Math.abs(location.lng) <= 180;

  return {
    street_address: street,
    city,
    state,
    postal_code: postal,
    latitude: hasLocation ? roundCoordinate(location!.lat) : null,
    longitude: hasLocation ? roundCoordinate(location!.lng) : null,
  };
}

export type AddressFieldsPatch = {
  street_address?: string | null;
  city?: string;
  state?: string;
  postal_code?: string | null;
  latitude: number | null;
  longitude: number | null;
};

/**
 * The one draft save a pick makes: street, ZIP and coordinates always (null
 * clears -- a new street's old ZIP would be wrong); city and state only when
 * the place has them, since both are required and can't be blanked.
 */
export function pickPatch(parsed: ParsedPlaceAddress): AddressFieldsPatch {
  const patch: AddressFieldsPatch = {
    street_address: parsed.street_address,
    postal_code: parsed.postal_code,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
  };
  if (parsed.city) patch.city = parsed.city;
  if (parsed.state) patch.state = parsed.state;
  return patch;
}

// ---------------------------------------------------------------------------
// Hand edits
// ---------------------------------------------------------------------------

export type HandEditedAddressField = "street_address" | "city" | "state" | "postal_code";

/**
 * A hand edit of street/city/state/ZIP. When the value really changed and
 * the draft has (or is about to have) coordinates, they're cleared in the
 * same save: they belonged to the address as picked, and null coordinates
 * make the post-publish geocode look the edited address up instead.
 */
export function handEditPatch(
  field: HandEditedAddressField,
  value: string | null,
  savedValue: string | null,
  hasCoordinates: boolean,
): Record<string, string | null> {
  const patch: Record<string, string | null> = { [field]: value };
  if (hasCoordinates && (savedValue ?? "") !== (value ?? "")) {
    patch.latitude = null;
    patch.longitude = null;
  }
  return patch;
}

// ---------------------------------------------------------------------------
// ZIP
// ---------------------------------------------------------------------------

const ZIP_RE = /^\d{5}(-\d{4})?$/;

/** "92373" or "92373-1234". Empty is allowed (no ZIP). */
export function isValidZip(value: string): boolean {
  return ZIP_RE.test(value.trim());
}

/** Trimmed ZIP, or null for empty. */
export function normalizeZip(value: string): string | null {
  const v = value.trim();
  return v === "" ? null : v;
}

// ---------------------------------------------------------------------------
// The lookup: suggestions + a pick, one billing session per pick
// ---------------------------------------------------------------------------

export type PickedPlace = {
  address: ParsedPlaceAddress;
  /** The place's name when a business was picked (shown in a small note, never saved). */
  businessName: string | null;
  formattedAddress: string | null;
};

export type AddressLookup = {
  suggest: (input: string) => Promise<AddressSuggestion[]>;
  pick: (id: string) => Promise<PickedPlace | null>;
};

export function createAddressLookup(places: PlacesLibraryLike): AddressLookup {
  let sessionToken: unknown = null;
  let predictions = new Map<string, PlacePredictionLike>();

  return {
    async suggest(input) {
      const query = input.trim();
      if (query.length < MIN_QUERY_LENGTH) return [];
      if (!sessionToken) sessionToken = new places.AutocompleteSessionToken();
      const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query,
        sessionToken,
        includedRegionCodes: ["us"],
        locationBias: INLAND_EMPIRE_BIAS,
      });
      predictions = new Map();
      const mapped: AddressSuggestion[] = [];
      for (const s of suggestions ?? []) {
        const p = s?.placePrediction;
        if (!p?.placeId || predictions.has(p.placeId)) continue;
        predictions.set(p.placeId, p);
        mapped.push(mapSuggestion(p));
      }
      return mapped;
    },

    async pick(id) {
      const prediction = predictions.get(id);
      if (!prediction) return null;
      const isBusiness = isBusinessPrediction(prediction.types ?? []);
      // The session ends with this details call; the next keystroke starts a
      // new one (a reused token is billed per request).
      sessionToken = null;
      predictions = new Map();
      const place = prediction.toPlace();
      await place.fetchFields({ fields: PLACE_FIELDS });
      const loc = place.location;
      const address = parsePlaceAddress(
        place.addressComponents,
        loc ? { lat: loc.lat(), lng: loc.lng() } : null,
      );
      return {
        address,
        businessName: isBusiness ? tidy(place.displayName) || null : null,
        formattedAddress: place.formattedAddress ?? null,
      };
    },
  };
}
