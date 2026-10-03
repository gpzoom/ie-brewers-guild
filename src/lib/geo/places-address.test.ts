import { describe, expect, it, vi } from "vitest";
import {
  INLAND_EMPIRE_BIAS,
  PLACE_FIELDS,
  createAddressLookup,
  formatSubpremise,
  handEditPatch,
  isBusinessPrediction,
  isValidZip,
  mapSuggestion,
  normalizeZip,
  parsePlaceAddress,
  pickPatch,
  type PlaceAddressComponentLike,
  type PlaceLike,
  type PlacePredictionLike,
  type PlacesLibraryLike,
} from "./places-address";

const c = (types: string[], longText: string, shortText = longText): PlaceAddressComponentLike => ({
  types,
  longText,
  shortText,
});

const hangar24 = [
  c(["street_number"], "1710"),
  c(["route"], "Sessums Drive", "Sessums Dr"),
  c(["locality", "political"], "Redlands"),
  c(["administrative_area_level_2", "political"], "San Bernardino County"),
  c(["administrative_area_level_1", "political"], "California", "CA"),
  c(["country", "political"], "United States", "US"),
  c(["postal_code"], "92374"),
];

describe("parsePlaceAddress", () => {
  it("builds street, city, state (short), ZIP and rounded coordinates", () => {
    expect(parsePlaceAddress(hangar24, { lat: 34.0661234567, lng: -117.2001234567 })).toEqual({
      street_address: "1710 Sessums Drive",
      city: "Redlands",
      state: "CA",
      postal_code: "92374",
      latitude: 34.066123,
      longitude: -117.200123,
    });
  });

  it("adds a subpremise as a suite", () => {
    const parsed = parsePlaceAddress([...hangar24, c(["subpremise"], "100")], { lat: 1, lng: 2 });
    expect(parsed.street_address).toBe("1710 Sessums Drive Suite 100");
  });

  it("falls back to postal_town / sublocality for the city", () => {
    const noLocality = hangar24.filter((x) => !x.types.includes("locality"));
    expect(parsePlaceAddress([...noLocality, c(["postal_town"], "Town")], null).city).toBe("Town");
    expect(
      parsePlaceAddress([...noLocality, c(["sublocality_level_1", "sublocality"], "Sub")], null)
        .city,
    ).toBe("Sub");
    expect(parsePlaceAddress(noLocality, null).city).toBeNull();
  });

  it("has no street and no coordinates for a place without a route (a city, a ZIP)", () => {
    const city = [
      c(["locality"], "Riverside"),
      c(["administrative_area_level_1"], "California", "CA"),
    ];
    expect(parsePlaceAddress(city, { lat: 33.9, lng: -117.3 })).toEqual({
      street_address: null,
      city: "Riverside",
      state: "CA",
      postal_code: null,
      latitude: null,
      longitude: null,
    });
  });

  it("drops out-of-range or missing coordinates", () => {
    expect(parsePlaceAddress(hangar24, { lat: 95, lng: 0 }).latitude).toBeNull();
    expect(parsePlaceAddress(hangar24, { lat: Number.NaN, lng: 0 }).longitude).toBeNull();
    expect(parsePlaceAddress(hangar24, null).latitude).toBeNull();
  });

  it("copes with no components at all", () => {
    expect(parsePlaceAddress(null, null).street_address).toBeNull();
  });
});

describe("formatSubpremise", () => {
  it("prefixes a bare number or code with Suite", () => {
    expect(formatSubpremise("100")).toBe("Suite 100");
    expect(formatSubpremise("A17")).toBe("Suite A17");
  });
  it("keeps a unit Google already labeled", () => {
    expect(formatSubpremise("Ste A17")).toBe("Ste A17");
    expect(formatSubpremise("Unit 5")).toBe("Unit 5");
    expect(formatSubpremise("#4")).toBe("#4");
  });
});

describe("pickPatch", () => {
  it("saves street, ZIP and coordinates together, plus city/state when present", () => {
    const parsed = parsePlaceAddress(hangar24, { lat: 34.066, lng: -117.2 });
    expect(pickPatch(parsed)).toEqual({
      street_address: "1710 Sessums Drive",
      city: "Redlands",
      state: "CA",
      postal_code: "92374",
      latitude: 34.066,
      longitude: -117.2,
    });
  });
  it("never blanks the required city/state", () => {
    const patch = pickPatch({
      street_address: "1 Main St",
      city: null,
      state: null,
      postal_code: null,
      latitude: 1,
      longitude: 2,
    });
    expect(patch).not.toHaveProperty("city");
    expect(patch).not.toHaveProperty("state");
    expect(patch.postal_code).toBeNull();
  });
});

describe("handEditPatch", () => {
  it("clears the coordinates when a changed value meets existing coordinates", () => {
    expect(handEditPatch("city", "Corona", "Redlands", true)).toEqual({
      city: "Corona",
      latitude: null,
      longitude: null,
    });
    expect(handEditPatch("postal_code", null, "92374", true)).toEqual({
      postal_code: null,
      latitude: null,
      longitude: null,
    });
  });
  it("leaves them alone when nothing changed (tabbing out after a pick)", () => {
    expect(
      handEditPatch("street_address", "1710 Sessums Drive", "1710 Sessums Drive", true),
    ).toEqual({
      street_address: "1710 Sessums Drive",
    });
  });
  it("sends no coordinate keys when there are none to clear", () => {
    expect(handEditPatch("state", "CA", "NV", false)).toEqual({ state: "CA" });
  });
  it("treats null and empty as the same value", () => {
    expect(handEditPatch("street_address", null, "", true)).toEqual({ street_address: null });
  });
});

describe("ZIP", () => {
  it("accepts 5 digits or ZIP+4", () => {
    expect(isValidZip("92374")).toBe(true);
    expect(isValidZip(" 92374-1234 ")).toBe(true);
  });
  it("rejects anything else", () => {
    for (const bad of ["9237", "923745", "92374-12", "ABCDE", "92374 1234", ""]) {
      expect(isValidZip(bad)).toBe(false);
    }
  });
  it("normalizes empty to null", () => {
    expect(normalizeZip("  ")).toBeNull();
    expect(normalizeZip(" 92374 ")).toBe("92374");
  });
});

// ---------------------------------------------------------------------------
// Suggestions and the lookup, against a fake Places library
// ---------------------------------------------------------------------------

function prediction(
  id: string,
  main: string,
  secondary: string,
  types: string[],
  place?: Partial<PlaceLike>,
): PlacePredictionLike {
  return {
    placeId: id,
    text: { text: `${main}, ${secondary}` },
    mainText: { text: main },
    secondaryText: { text: secondary },
    types,
    toPlace: () => ({
      fetchFields: vi.fn(async () => undefined),
      addressComponents: hangar24,
      location: { lat: () => 34.066, lng: () => -117.2 },
      formattedAddress: "1710 Sessums Dr, Redlands, CA 92374, USA",
      displayName: "Hangar 24 Craft Brewery",
      ...place,
    }),
  };
}

describe("isBusinessPrediction / mapSuggestion", () => {
  it("tells businesses from plain addresses", () => {
    expect(isBusinessPrediction(["bar", "establishment", "point_of_interest"])).toBe(true);
    expect(isBusinessPrediction(["brewery"])).toBe(true);
    expect(isBusinessPrediction(["street_address", "geocode"])).toBe(false);
    expect(isBusinessPrediction(["premise", "geocode"])).toBe(false);
    expect(isBusinessPrediction([])).toBe(false);
  });
  it("maps main/secondary text, falling back to the full text", () => {
    expect(
      mapSuggestion(prediction("p1", "Hangar 24", "Redlands, CA, USA", ["establishment"])),
    ).toEqual({
      id: "p1",
      mainText: "Hangar 24",
      secondaryText: "Redlands, CA, USA",
      isBusiness: true,
    });
    const bare = {
      ...prediction("p2", "x", "y", ["geocode"]),
      mainText: null,
      secondaryText: null,
    };
    expect(mapSuggestion(bare)).toMatchObject({ mainText: "x, y", secondaryText: "" });
  });
});

function fakePlaces(predictions: PlacePredictionLike[]) {
  let tokens = 0;
  class Token {
    n = ++tokens;
  }
  const fetchAutocompleteSuggestions = vi.fn(async () => ({
    suggestions: predictions.map((p) => ({ placePrediction: p })),
  }));
  const library: PlacesLibraryLike = {
    AutocompleteSessionToken: Token,
    AutocompleteSuggestion: { fetchAutocompleteSuggestions },
  };
  return { library, fetchAutocompleteSuggestions };
}

describe("createAddressLookup", () => {
  it("doesn't ask Google for fewer than 3 characters", async () => {
    const { library, fetchAutocompleteSuggestions } = fakePlaces([]);
    const lookup = createAddressLookup(library);
    expect(await lookup.suggest(" ha ")).toEqual([]);
    expect(fetchAutocompleteSuggestions).not.toHaveBeenCalled();
  });

  it("asks for US results biased to the Inland Empire, one token per session", async () => {
    const { library, fetchAutocompleteSuggestions } = fakePlaces([
      prediction("p1", "Hangar 24 Craft Brewery", "Redlands, CA, USA", ["establishment"]),
      prediction("p1", "duplicate", "ignored", ["establishment"]),
      prediction("p2", "1710 Sessums Dr", "Redlands, CA, USA", ["street_address", "geocode"]),
    ]);
    const lookup = createAddressLookup(library);
    const first = await lookup.suggest("Hang");
    await lookup.suggest("Hangar 2");
    expect(first.map((s) => s.id)).toEqual(["p1", "p2"]);
    const calls = fetchAutocompleteSuggestions.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >;
    expect(calls[0][0]).toMatchObject({
      input: "Hang",
      includedRegionCodes: ["us"],
      locationBias: INLAND_EMPIRE_BIAS,
    });
    expect(calls[0][0].sessionToken).toBe(calls[1][0].sessionToken);
  });

  it("a pick fetches the fields, parses the address, names a business, and starts a new session", async () => {
    const fetchFields = vi.fn(async () => undefined);
    const { library, fetchAutocompleteSuggestions } = fakePlaces([
      prediction("p1", "Hangar 24 Craft Brewery", "Redlands, CA, USA", ["establishment"], {
        fetchFields,
      }),
    ]);
    const lookup = createAddressLookup(library);
    await lookup.suggest("Hangar 24");
    const picked = await lookup.pick("p1");
    expect(fetchFields).toHaveBeenCalledWith({ fields: PLACE_FIELDS });
    expect(picked).toEqual({
      address: {
        street_address: "1710 Sessums Drive",
        city: "Redlands",
        state: "CA",
        postal_code: "92374",
        latitude: 34.066,
        longitude: -117.2,
      },
      businessName: "Hangar 24 Craft Brewery",
      formattedAddress: "1710 Sessums Dr, Redlands, CA 92374, USA",
    });

    await lookup.suggest("another");
    const calls = fetchAutocompleteSuggestions.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >;
    expect(calls[1][0].sessionToken).not.toBe(calls[0][0].sessionToken);
  });

  it("names no business for a plain address pick", async () => {
    const { library } = fakePlaces([
      prediction("p2", "1710 Sessums Dr", "Redlands, CA, USA", ["street_address", "geocode"]),
    ]);
    const lookup = createAddressLookup(library);
    await lookup.suggest("1710 Sess");
    expect((await lookup.pick("p2"))?.businessName).toBeNull();
  });

  it("returns null for an unknown id and passes Google errors up", async () => {
    const { library, fetchAutocompleteSuggestions } = fakePlaces([]);
    const lookup = createAddressLookup(library);
    expect(await lookup.pick("nope")).toBeNull();
    fetchAutocompleteSuggestions.mockRejectedValueOnce(
      new Error("Places API (New) has not been used"),
    );
    await expect(lookup.suggest("Hangar")).rejects.toThrow("Places API");
  });
});
