import { describe, expect, it } from "vitest";
import {
  distanceMiles,
  filterCards,
  formatMiles,
  matchesSearch,
  nearestDistance,
  orderByDistance,
  splitLocations,
  type FilterableCard,
} from "./directory-filters";

const card = (name: string, memberType: FilterableCard["memberType"], cities: string[], pins: Array<[number, number] | null> = []): FilterableCard => ({
  name,
  memberType,
  locations: cities.map((city, i) => ({ city, lat: pins[i]?.[0] ?? null, lng: pins[i]?.[1] ?? null })),
});

const ALL = [
  card("Hangar 24 Brewing Co.", "producer", ["Irvine", "Redlands", "Riverside"]),
  card("Café Cerveza", "producer", ["Ontario"]),
  card("Sample Taco Truck", "mobile", ["Riverside"]),
  card("Sample Supply Co.", "allied", ["Ontario"]),
];

describe("search", () => {
  it("matches the business name or any of its cities, ignoring case, accents and outer spaces", () => {
    expect(matchesSearch(ALL[0], "  HANGAR ")).toBe(true);
    expect(matchesSearch(ALL[0], "redlands")).toBe(true);
    expect(matchesSearch(ALL[1], "cafe")).toBe(true);
    expect(matchesSearch(ALL[1], "corona")).toBe(false);
  });
  it("an empty search matches everything", () => {
    expect(filterCards(ALL, { query: "   " })).toHaveLength(4);
  });
});

describe("type filter", () => {
  it("keeps only that type; none = all types", () => {
    expect(filterCards(ALL, { query: "", type: "mobile" }).map((c) => c.name)).toEqual(["Sample Taco Truck"]);
    expect(filterCards(ALL, { query: "ontario", type: "allied" }).map((c) => c.name)).toEqual(["Sample Supply Co."]);
  });
});

describe("distance and Near me", () => {
  const riverside = { lat: 33.9806, lng: -117.3755 };
  it("distanceMiles: Riverside to Ontario is about 16 miles", () => {
    expect(distanceMiles(riverside, { lat: 34.0633, lng: -117.6509 })).toBeGreaterThan(15);
    expect(distanceMiles(riverside, { lat: 34.0633, lng: -117.6509 })).toBeLessThan(18);
  });
  it("formatMiles has one decimal", () => {
    expect(formatMiles(1.234)).toBe("1.2 mi");
    expect(formatMiles(11.66)).toBe("11.7 mi");
  });
  it("orders by nearest location; members with no pin go last, A–Z", () => {
    type C = { name: string; pts: Array<{ lat: number; lng: number }> };
    const cards: C[] = [
      { name: "Zeta (no pin)", pts: [] },
      { name: "Far", pts: [{ lat: 34.06, lng: -117.65 }] },
      { name: "Alpha (no pin)", pts: [] },
      { name: "Near", pts: [{ lat: 34.5, lng: -117.3 }, { lat: 33.98, lng: -117.37 }] },
    ];
    const ordered = orderByDistance(cards, riverside, (c) => c.pts, (c) => c.name).map((c) => c.name);
    expect(ordered).toEqual(["Near", "Far", "Alpha (no pin)", "Zeta (no pin)"]);
    expect(nearestDistance([], riverside)).toBeNull();
  });
});

describe("splitLocations", () => {
  it("shows two, hides the rest; two or fewer shows all", () => {
    expect(splitLocations([1, 2, 3, 4])).toEqual({ shown: [1, 2], hidden: [3, 4] });
    expect(splitLocations([1, 2])).toEqual({ shown: [1, 2], hidden: [] });
  });
});

describe("orderLocations (Near me: a card's rows by distance)", () => {
  it("nearest first, no-pin rows last; no origin keeps the given order", async () => {
    const { orderLocations } = await import("./directory-filters");
    const rows = [
      { city: "Irvine", lat: 33.69, lng: -117.85 },
      { city: "Lake Havasu City", lat: null, lng: null },
      { city: "Riverside", lat: 33.955, lng: -117.33 },
    ];
    const riverside = { lat: 33.9806, lng: -117.3755 };
    expect(orderLocations(rows, riverside).map((r) => r.city)).toEqual(["Riverside", "Irvine", "Lake Havasu City"]);
    expect(orderLocations(rows, null).map((r) => r.city)).toEqual(["Irvine", "Lake Havasu City", "Riverside"]);
  });
});
