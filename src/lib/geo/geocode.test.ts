import { describe, expect, it, vi } from "vitest";
import {
  buildGeocodeAddress,
  buildGeocodeUrl,
  geocodeAddress,
  needsGeocode,
  parseGeocodeResponse,
  type FetchLike,
} from "./geocode";

const addr = { street_address: "110 North Dr", city: "Norco", state: "CA" };
const withCoords = { ...addr, latitude: 33.953346, longitude: -117.524014 };

function okResponse(overrides: Record<string, unknown> = {}) {
  return {
    status: "OK",
    results: [
      {
        formatted_address: "110 North Dr, Norco, CA 92860, USA",
        geometry: { location: { lat: 33.95334567, lng: -117.52401449 }, location_type: "ROOFTOP" },
        address_components: [
          { long_name: "110", short_name: "110", types: ["street_number"] },
          { long_name: "92860", short_name: "92860", types: ["postal_code"] },
        ],
        ...overrides,
      },
    ],
  };
}

describe("buildGeocodeAddress", () => {
  it("joins street, city and state", () => {
    expect(buildGeocodeAddress(addr)).toBe("110 North Dr, Norco, CA");
  });
  it("tidies whitespace", () => {
    expect(buildGeocodeAddress({ street_address: "  110  North Dr ", city: " Norco", state: "CA " })).toBe(
      "110 North Dr, Norco, CA",
    );
  });
  it("returns null without a street address (mobile members get no pin)", () => {
    expect(buildGeocodeAddress({ ...addr, street_address: null })).toBeNull();
    expect(buildGeocodeAddress({ ...addr, street_address: "   " })).toBeNull();
  });
});

describe("needsGeocode", () => {
  it("is true when coordinates are missing", () => {
    expect(needsGeocode(null, { ...addr, latitude: null, longitude: null })).toBe(true);
    expect(needsGeocode(addr, { ...addr, latitude: 33.9, longitude: null })).toBe(true);
  });
  it("is true when the street, city or state changed in this publish", () => {
    expect(needsGeocode({ ...addr, street_address: "1 Old Rd" }, withCoords)).toBe(true);
    expect(needsGeocode({ ...addr, city: "Corona" }, withCoords)).toBe(true);
  });
  it("is false when nothing relevant changed (case/space-insensitive)", () => {
    expect(needsGeocode({ street_address: "110 north dr ", city: "NORCO", state: "ca" }, withCoords)).toBe(false);
  });
  it("is false without a street address", () => {
    expect(needsGeocode(null, { ...withCoords, street_address: null, latitude: null })).toBe(false);
  });
  it("is false when the before-state is unknown and coordinates exist", () => {
    expect(needsGeocode(null, withCoords)).toBe(false);
  });
});

describe("buildGeocodeUrl", () => {
  it("encodes the address and key", () => {
    const url = new URL(buildGeocodeUrl("5135 Edison Ave #1, Chino, CA", "k&y"));
    expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/geocode/json");
    expect(url.searchParams.get("address")).toBe("5135 Edison Ave #1, Chino, CA");
    expect(url.searchParams.get("key")).toBe("k&y");
    expect(url.searchParams.get("region")).toBe("us");
  });
});

describe("parseGeocodeResponse", () => {
  it("reads coordinates (rounded to 6 places) and the postal code", () => {
    expect(parseGeocodeResponse(okResponse())).toEqual({
      lat: 33.953346,
      lng: -117.524014,
      postalCode: "92860",
      formattedAddress: "110 North Dr, Norco, CA 92860, USA",
    });
  });
  it("returns a null postal code when Google doesn't give one", () => {
    expect(parseGeocodeResponse(okResponse({ address_components: [] }))?.postalCode).toBeNull();
  });
  it("rejects APPROXIMATE (city/ZIP-level) results", () => {
    expect(
      parseGeocodeResponse(
        okResponse({ geometry: { location: { lat: 33.9, lng: -117.5 }, location_type: "APPROXIMATE" } }),
      ),
    ).toBeNull();
  });
  it("accepts RANGE_INTERPOLATED and GEOMETRIC_CENTER", () => {
    for (const location_type of ["RANGE_INTERPOLATED", "GEOMETRIC_CENTER"]) {
      expect(
        parseGeocodeResponse(okResponse({ geometry: { location: { lat: 1, lng: 2 }, location_type } })),
      ).toMatchObject({ lat: 1, lng: 2 });
    }
  });
  it("returns null for ZERO_RESULTS, errors, junk and out-of-range values", () => {
    expect(parseGeocodeResponse({ status: "ZERO_RESULTS", results: [] })).toBeNull();
    expect(parseGeocodeResponse({ status: "REQUEST_DENIED", results: [] })).toBeNull();
    expect(parseGeocodeResponse(null)).toBeNull();
    expect(parseGeocodeResponse({ status: "OK", results: [] })).toBeNull();
    expect(parseGeocodeResponse(okResponse({ geometry: { location: { lat: "x", lng: 2 } } }))).toBeNull();
    expect(parseGeocodeResponse(okResponse({ geometry: { location: { lat: 95, lng: 2 } } }))).toBeNull();
  });
});

describe("geocodeAddress", () => {
  function fakeFetch(body: unknown, status = 200) {
    return vi.fn<FetchLike>(async () => ({ ok: status < 400, status, json: async () => body }));
  }

  it("calls the Geocoding API and parses the result", async () => {
    const fetchImpl = fakeFetch(okResponse());
    const result = await geocodeAddress({ address: "110 North Dr, Norco, CA", apiKey: "KEY", fetchImpl });
    expect(result).toMatchObject({ lat: 33.953346, lng: -117.524014, postalCode: "92860" });
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.get("address")).toBe("110 North Dr, Norco, CA");
    expect(url.searchParams.get("key")).toBe("KEY");
    expect(fetchImpl.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it("returns null for ZERO_RESULTS", async () => {
    const fetchImpl = fakeFetch({ status: "ZERO_RESULTS", results: [] });
    expect(await geocodeAddress({ address: "nowhere", apiKey: "KEY", fetchImpl })).toBeNull();
  });
  it("throws with Google's message for a key/API problem", async () => {
    const fetchImpl = fakeFetch({ status: "REQUEST_DENIED", error_message: "API not enabled" });
    await expect(geocodeAddress({ address: "x", apiKey: "KEY", fetchImpl })).rejects.toThrow(
      "Geocoding API REQUEST_DENIED: API not enabled",
    );
  });
  it("throws on an HTTP error", async () => {
    const fetchImpl = fakeFetch({}, 500);
    await expect(geocodeAddress({ address: "x", apiKey: "KEY", fetchImpl })).rejects.toThrow("HTTP 500");
  });
});
