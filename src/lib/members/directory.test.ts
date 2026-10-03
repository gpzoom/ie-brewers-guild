import { describe, expect, it } from "vitest";
import {
  buildDirectoryMembers,
  directionsUrl,
  directoryPins,
  formatDirectoryAddress,
  type DirectoryLinkRow,
  type DirectoryMemberRow,
} from "./directory";

function row(overrides: Partial<DirectoryMemberRow>): DirectoryMemberRow {
  return {
    id: "m1",
    slug: "euryale-brewing-co",
    member_type: "producer",
    business_name: "Euryale Brewing Co.",
    city: "Riverside",
    state: "CA",
    street_address: "2060 Chicago Ave STE A17",
    postal_code: "92507",
    latitude: 33.992759,
    longitude: -117.347977,
    logo_asset_id: "logo-1",
    ...overrides,
  };
}

function link(overrides: Partial<DirectoryLinkRow>): DirectoryLinkRow {
  return { member_id: "m1", kind: "website", label: null, url: "https://example.com/", sort_order: 0, ...overrides };
}

describe("formatDirectoryAddress", () => {
  it("joins street, city, state and ZIP like the old list", () => {
    expect(formatDirectoryAddress(row({}))).toBe("2060 Chicago Ave STE A17, Riverside, CA 92507");
  });
  it("falls back to city and state without a street address", () => {
    expect(
      formatDirectoryAddress(row({ street_address: null, postal_code: null })),
    ).toBe("Riverside, CA");
  });
});

describe("buildDirectoryMembers", () => {
  it("maps a single-location member into the card shape", () => {
    const [card] = buildDirectoryMembers({
      rows: [row({})],
      links: [
        link({ kind: "website", url: "https://euryalebrewing.com/" }),
        link({ kind: "facebook", url: "https://facebook.com/euryale", sort_order: 1 }),
        link({ kind: "instagram", url: "https://instagram.com/euryale", sort_order: 2 }),
        link({ kind: "other", label: "Untappd", url: "https://untappd.com/Euryale", sort_order: 3 }),
      ],
      logoUrls: new Map([["logo-1", "https://cdn.example/logo.png"]]),
    });
    expect(card).toEqual({
      name: "Euryale Brewing Co.",
      memberType: "producer",
      locations: [
        {
          slug: "euryale-brewing-co",
          city: "Riverside",
          address: "2060 Chicago Ave STE A17, Riverside, CA 92507",
          lat: 33.992759,
          lng: -117.347977,
        },
      ],
      website: "https://euryalebrewing.com/",
      logo: "https://cdn.example/logo.png",
      facebook: "https://facebook.com/euryale",
      instagram: "https://instagram.com/euryale",
      untappd: "https://untappd.com/Euryale",
    });
  });

  it("groups a multi-location business into one card, locations by city, each with its own slug", () => {
    const cards = buildDirectoryMembers({
      rows: [
        row({ id: "a", slug: "metabolic-brewing-co-ontario", business_name: "Metabolic Brewing Co.", city: "Ontario" }),
        row({ id: "b", slug: "metabolic-brewing-co-chino", business_name: "Metabolic Brewing Co.", city: "Chino" }),
      ],
      links: [link({ member_id: "b", url: "https://metabolicbrewing.com/" })],
      logoUrls: new Map(),
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].locations.map((l) => l.slug)).toEqual([
      "metabolic-brewing-co-chino",
      "metabolic-brewing-co-ontario",
    ]);
    expect(cards[0].website).toBe("https://metabolicbrewing.com/");
  });

  it("orders cards by business name", () => {
    const cards = buildDirectoryMembers({
      rows: [
        row({ id: "1", business_name: "Norco Brewing Co.", slug: "norco" }),
        row({ id: "2", business_name: "All Points Brewing Co.", slug: "all-points" }),
      ],
      links: [],
      logoUrls: new Map(),
    });
    expect(cards.map((c) => c.name)).toEqual(["All Points Brewing Co.", "Norco Brewing Co."]);
  });

  it("gives a member without a street address a card but no coordinates (mobile)", () => {
    const [card] = buildDirectoryMembers({
      rows: [row({ member_type: "mobile", street_address: null, latitude: 34, longitude: -117 })],
      links: [],
      logoUrls: new Map(),
    });
    expect(card.locations[0]).toMatchObject({ lat: null, lng: null, address: "Riverside, CA 92507" });
    expect(card.website).toBeNull();
    expect(card.logo).toBeNull();
    expect(card.facebook).toBeUndefined();
  });

  it("leaves coordinates null when not geocoded yet, and accepts numeric strings", () => {
    const cards = buildDirectoryMembers({
      rows: [
        row({ id: "1", slug: "a", business_name: "A", latitude: null, longitude: null }),
        row({ id: "2", slug: "b", business_name: "B", latitude: "33.5", longitude: "-117.25" }),
      ],
      links: [],
      logoUrls: new Map(),
    });
    expect(cards[0].locations[0]).toMatchObject({ lat: null, lng: null });
    expect(cards[1].locations[0]).toMatchObject({ lat: 33.5, lng: -117.25 });
  });

  it("recognizes Untappd by host when the label is missing, and ignores other 'other' links", () => {
    const [card] = buildDirectoryMembers({
      rows: [row({})],
      links: [
        link({ kind: "other", label: "Shop", url: "https://shop.example.com/" }),
        link({ kind: "other", label: null, url: "https://untappd.com/w/x/1", sort_order: 4 }),
      ],
      logoUrls: new Map(),
    });
    expect(card.untappd).toBe("https://untappd.com/w/x/1");
  });

  it("uses the fallback icon when the logo asset isn't readable", () => {
    const [card] = buildDirectoryMembers({ rows: [row({})], links: [], logoUrls: new Map() });
    expect(card.logo).toBeNull();
  });
});

describe("directoryPins", () => {
  it("makes one pin per location with coordinates, skipping the rest", () => {
    const cards = buildDirectoryMembers({
      rows: [
        row({ id: "a", slug: "x-ontario", business_name: "X", city: "Ontario" }),
        row({ id: "b", slug: "x-chino", business_name: "X", city: "Chino", latitude: null }),
        row({ id: "c", slug: "mobile", business_name: "Mobile", street_address: null }),
      ],
      links: [link({ member_id: "a", url: "https://x.example/" })],
      logoUrls: new Map(),
    });
    const pins = directoryPins(cards);
    expect(pins).toEqual([
      {
        brewery: "X",
        slug: "x-ontario",
        city: "Ontario",
        address: "2060 Chicago Ave STE A17, Ontario, CA 92507",
        lat: 33.992759,
        lng: -117.347977,
        website: "https://x.example/",
        tourUrl: undefined,
      },
    ]);
  });
});

describe("directionsUrl", () => {
  it("uses coordinates when known", () => {
    expect(directionsUrl({ lat: 1.5, lng: -2, address: "x" })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=1.5,-2",
    );
  });
  it("falls back to the address text", () => {
    expect(directionsUrl({ lat: null, lng: null, address: "Riverside, CA" })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Riverside%2C%20CA",
    );
  });
});
