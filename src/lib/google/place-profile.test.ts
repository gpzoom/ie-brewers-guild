import { describe, expect, it } from "vitest";
import {
  mapOpeningHours,
  mapPlaceToProfile,
  TAGLINE_MAX,
  type GooglePlaceDetails,
} from "./place-profile";

const comps = [
  { longText: "123", shortText: "123", types: ["street_number"] },
  { longText: "Main Street", shortText: "Main St", types: ["route"] },
  { longText: "Redlands", shortText: "Redlands", types: ["locality"] },
  { longText: "California", shortText: "CA", types: ["administrative_area_level_1"] },
  { longText: "92373", shortText: "92373", types: ["postal_code"] },
];

describe("mapPlaceToProfile", () => {
  it("maps address via parsePlaceAddress", () => {
    const p = mapPlaceToProfile({
      id: "abc",
      displayName: { text: "Test Brewing" },
      addressComponents: comps,
      location: { latitude: 34.0555, longitude: -117.1825 },
      nationalPhoneNumber: "(909) 555-0100",
      websiteUri: "https://example.com",
    });
    expect(p).toMatchObject({
      placeId: "abc",
      businessName: "Test Brewing",
      street_address: "123 Main Street",
      city: "Redlands",
      state: "CA",
      postal_code: "92373",
      latitude: 34.0555,
      longitude: -117.1825,
      phone: "(909) 555-0100",
      website: "https://example.com",
      permanentlyClosed: false,
    });
  });

  it("uses editorialSummary as tagline only when within TAGLINE_MAX", () => {
    const ok = "x".repeat(TAGLINE_MAX);
    expect(mapPlaceToProfile({ id: "a", editorialSummary: { text: ok } }).tagline).toBe(ok);
    expect(
      mapPlaceToProfile({ id: "a", editorialSummary: { text: ok + "x" } }).tagline,
    ).toBeNull();
    expect(mapPlaceToProfile({ id: "a" }).tagline).toBeNull();
  });

  it("flags CLOSED_PERMANENTLY", () => {
    expect(
      mapPlaceToProfile({ id: "a", businessStatus: "CLOSED_PERMANENTLY" }).permanentlyClosed,
    ).toBe(true);
  });

  it("hours is null without regularOpeningHours", () => {
    expect(mapPlaceToProfile({ id: "a" }).hours).toBeNull();
  });

  it("maps hours when present", () => {
    const place: GooglePlaceDetails = {
      id: "a",
      regularOpeningHours: {
        periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 30 } }],
      },
    };
    expect(mapPlaceToProfile(place).hours).toHaveLength(7);
  });
});

describe("mapOpeningHours", () => {
  it("handles a period that closes after midnight", () => {
    const rows = mapOpeningHours([
      { open: { day: 5, hour: 15, minute: 0 }, close: { day: 6, hour: 1, minute: 0 } },
    ])!;
    expect(rows[5]).toEqual({
      weekday: 5,
      opens_at: "15:00",
      closes_at: "01:00",
      closes_next_day: true,
      is_closed: false,
    });
  });

  it("marks days without a period closed, always 7 rows sorted 0..6", () => {
    const rows = mapOpeningHours([
      { open: { day: 3, hour: 9, minute: 5 }, close: { day: 3, hour: 17, minute: 0 } },
    ])!;
    expect(rows.map((r) => r.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(rows[0]).toEqual({
      weekday: 0,
      opens_at: null,
      closes_at: null,
      closes_next_day: false,
      is_closed: true,
    });
    expect(rows[3].opens_at).toBe("09:05");
  });

  it("takes earliest open and latest close for multiple periods on a day", () => {
    const rows = mapOpeningHours([
      { open: { day: 2, hour: 17, minute: 0 }, close: { day: 2, hour: 22, minute: 0 } },
      { open: { day: 2, hour: 11, minute: 0 }, close: { day: 2, hour: 14, minute: 0 } },
    ])!;
    expect(rows[2].opens_at).toBe("11:00");
    expect(rows[2].closes_at).toBe("22:00");
    expect(rows[2].closes_next_day).toBe(false);
  });

  it("returns null for a 24/7 place (period with no close)", () => {
    expect(mapOpeningHours([{ open: { day: 0, hour: 0, minute: 0 } }])).toBeNull();
  });

  it("handles Saturday to Sunday wraparound", () => {
    const rows = mapOpeningHours([
      { open: { day: 6, hour: 22, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } },
    ])!;
    expect(rows[6]).toEqual({
      weekday: 6,
      opens_at: "22:00",
      closes_at: "02:00",
      closes_next_day: true,
      is_closed: false,
    });
    expect(rows[0].is_closed).toBe(true);
  });

  it("picks the overnight close as latest when a same-day earlier period exists", () => {
    const rows = mapOpeningHours([
      { open: { day: 5, hour: 11, minute: 0 }, close: { day: 5, hour: 14, minute: 0 } },
      { open: { day: 5, hour: 18, minute: 0 }, close: { day: 6, hour: 1, minute: 0 } },
    ])!;
    expect(rows[5].opens_at).toBe("11:00");
    expect(rows[5].closes_at).toBe("01:00");
    expect(rows[5].closes_next_day).toBe(true);
  });

  it("returns null for undefined periods", () => {
    expect(mapOpeningHours(undefined)).toBeNull();
  });
});
