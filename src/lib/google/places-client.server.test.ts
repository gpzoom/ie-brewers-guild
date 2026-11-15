import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ env: { GOOGLE_PLACES_API_KEY: "secret-key-123" } as Record<string, string | undefined> }));
vi.mock("cloudflare:workers", () => ({ env: h.env }));

import { INLAND_EMPIRE_BIAS } from "@/lib/geo/places-address";
import { DETAILS_FIELD_MASK, SEARCH_FIELD_MASK, getPlaceDetails, searchPlaces } from "./places-client.server";

function fakeFetch(body: unknown, ok = true, status = 200) {
  return vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok,
    status,
    json: async () => body,
    text: async () => "upstream says secret-key-123",
  })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("searchPlaces", () => {
  it("POSTs a text search with field mask, bias, and maps results", async () => {
    const f = fakeFetch({
      places: [{ id: "p1", displayName: { text: "Brew Co" }, formattedAddress: "1 Main St" }, { id: "p2" }],
    });
    const out = await searchPlaces("Brew Co", "Riverside", f);
    const [url, init] = (f as any).mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Goog-FieldMask"]).toBe(SEARCH_FIELD_MASK);
    expect(init.headers["X-Goog-Api-Key"]).toBe("secret-key-123");
    const body = JSON.parse(init.body);
    expect(body.textQuery).toBe("Brew Co Riverside");
    expect(body.maxResultCount).toBe(5);
    expect(body.locationBias).toEqual({
      circle: {
        center: { latitude: INLAND_EMPIRE_BIAS.center.lat, longitude: INLAND_EMPIRE_BIAS.center.lng },
        radius: INLAND_EMPIRE_BIAS.radius,
      },
    });
    expect(out).toEqual([
      { placeId: "p1", name: "Brew Co", address: "1 Main St" },
      { placeId: "p2", name: "", address: "" },
    ]);
  });

  it("returns [] when Google returns no places", async () => {
    expect(await searchPlaces("x", "y", fakeFetch({}))).toEqual([]);
  });

  it("throws a generic error on non-2xx without echoing the key", async () => {
    const err = await searchPlaces("a", "b", fakeFetch({}, false, 403)).catch((e) => e);
    expect(err.message).toBe("Google lookup failed");
    expect(err.message).not.toContain("secret-key-123");
  });

  it("throws when the key is missing", async () => {
    h.env.GOOGLE_PLACES_API_KEY = undefined;
    await expect(searchPlaces("a", "b", fakeFetch({}))).rejects.toThrow("Google lookup isn't set up");
    h.env.GOOGLE_PLACES_API_KEY = "secret-key-123";
  });
});

describe("getPlaceDetails", () => {
  it("GETs the place with the details field mask", async () => {
    const f = fakeFetch({ id: "abc", displayName: { text: "X" } });
    const out = await getPlaceDetails("abc", f);
    const [url, init] = (f as any).mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places/abc");
    expect(init.headers["X-Goog-FieldMask"]).toBe(DETAILS_FIELD_MASK);
    expect(out.id).toBe("abc");
  });

  it("encodes the place id", async () => {
    const f = fakeFetch({ id: "a/b" });
    await getPlaceDetails("a/b", f);
    expect((f as any).mock.calls[0][0]).toBe("https://places.googleapis.com/v1/places/a%2Fb");
  });

  it("throws on non-2xx", async () => {
    await expect(getPlaceDetails("abc", fakeFetch({}, false, 404))).rejects.toThrow("Google lookup failed");
  });
});
