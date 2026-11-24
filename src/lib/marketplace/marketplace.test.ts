import { describe, expect, it } from "vitest";
import {
  contactMailto,
  filterListings,
  listingState,
  NO_FILTERS,
  pageOf,
  parsePrice,
  priceText,
  validateListing,
  type ListingInput,
  type MarketplaceListing,
} from "@/lib/marketplace/marketplace";

const input: ListingInput = {
  kind: "equipment",
  categoryId: "cat1",
  title: " 7 BBL fermenter ",
  description: "Jacketed",
  condition: "good",
  price: "$4,500",
  priceUnit: "",
  negotiable: true,
  locationText: "",
  contactName: "",
  contactEmail: "pat@example.test",
  contactPhone: "",
  photoPaths: [],
  noAlcohol: true,
};

const listing = (over: Partial<MarketplaceListing>): MarketplaceListing => ({
  id: "1",
  memberId: "m1",
  memberName: "Sample Brewery",
  memberSlug: "sample",
  memberStatus: "published",
  memberCity: "Riverside",
  kind: "equipment",
  categoryId: "cat1",
  title: "Fermenter",
  description: "Stainless tank",
  condition: null,
  priceCents: 10000,
  priceUnit: null,
  negotiable: false,
  locationText: null,
  contactName: null,
  contactEmail: "a@example.test",
  contactPhone: null,
  photoPaths: [],
  photoUrls: [],
  status: "open",
  postedAt: "2026-11-01T00:00:00Z",
  expiresAt: "2026-12-31T00:00:00Z",
  ...over,
});

describe("parsePrice", () => {
  it("reads dollars, commas and cents", () => {
    expect(parsePrice("1,200")).toBe(120000);
    expect(parsePrice("$8.50")).toBe(850);
    expect(parsePrice("1000000")).toBe(100_000_000);
    expect(parsePrice("0")).toBe(0);
  });
  it("empty is no price; anything else is refused", () => {
    expect(parsePrice("  ")).toBeNull();
    for (const bad of ["abc", "-5", "1,20", "1.234", "1e9", "2000000", "10 each"]) expect(parsePrice(bad)).toBeUndefined();
  });
});

describe("validateListing", () => {
  it("cleans a good listing", () => {
    expect(validateListing(input)).toMatchObject({
      ok: true,
      value: { title: "7 BBL fermenter", price_cents: 450000, condition: "good", contact_phone: null, location_text: null },
    });
  });
  it("asks for what's missing", () => {
    const cases: [Partial<ListingInput>, RegExp][] = [
      [{ categoryId: "" }, /category/],
      [{ title: " " }, /title/],
      [{ description: "" }, /description/],
      [{ price: "lots" }, /price/],
      [{ contactEmail: "" }, /email address or a phone/],
      [{ contactEmail: "nope" }, /Check the email/],
      [{ contactPhone: "12" }, /phone number/],
      [{ photoPaths: Array(7).fill("x") }, /6 photos/],
      [{ noAlcohol: false }, /alcohol/],
      [{ kind: "beer" as never }, /posting/],
    ];
    for (const [over, message] of cases) {
      const result = validateListing({ ...input, ...over });
      expect(result.ok ? "" : result.error).toMatch(message);
    }
  });
  it("drops a condition on services and In Search Of, and a unit with no price", () => {
    for (const kind of ["service", "wanted"] as const) {
      expect(validateListing({ ...input, kind, price: "", priceUnit: "keg" })).toMatchObject({
        ok: true,
        value: { condition: null, price_cents: null, price_unit: null },
      });
    }
  });
});

describe("priceText", () => {
  it("says prices, units, budgets and no price", () => {
    expect(priceText(listing({ priceCents: 120000 }))).toBe("$1,200");
    expect(priceText(listing({ priceCents: 850, priceUnit: "per keg" }))).toBe("$8.50 per keg");
    expect(priceText(listing({ priceCents: null }))).toBe("Contact for price");
    expect(priceText(listing({ priceCents: 0 }))).toBe("Free");
    expect(priceText(listing({ kind: "wanted", priceCents: 50000 }))).toBe("Budget $500");
    expect(priceText(listing({ kind: "wanted", priceCents: null }))).toBe("Budget open");
  });
});

describe("filterListings", () => {
  const all = [
    listing({ id: "a", title: "Keg washer", priceCents: 50000, postedAt: "2026-11-03T00:00:00Z", categoryId: "cat2" }),
    listing({ id: "b", title: "Fermenter", priceCents: null, postedAt: "2026-11-02T00:00:00Z", categoryId: null }),
    listing({ id: "c", title: "Canning line", priceCents: 900000, kind: "wanted", postedAt: "2026-11-01T00:00:00Z" }),
  ];
  const ids = (over: Partial<typeof NO_FILTERS>) => filterListings(all, { ...NO_FILTERS, ...over }).map((l) => l.id).join("");
  it("searches every word in any order, including the brewery and city", () => {
    expect(ids({ keyword: "washer KEG" })).toBe("a");
    expect(ids({ keyword: "sample riverside" })).toBe("abc");
    expect(ids({ keyword: "keg canning" })).toBe("");
  });
  it("filters by kind, category and price", () => {
    expect(ids({ kind: "wanted" })).toBe("c");
    expect(ids({ categoryId: "cat2" })).toBe("a");
    expect(ids({ categoryId: "none" })).toBe("b");
    expect(ids({ minPrice: "600" })).toBe("c");
    expect(ids({ maxPrice: "600" })).toBe("a");
    expect(ids({ minPrice: "abc" })).toBe("abc");
  });
  it("sorts, with no price last", () => {
    expect(ids({})).toBe("abc");
    expect(ids({ sort: "price_low" })).toBe("acb");
    expect(ids({ sort: "price_high" })).toBe("cab");
    expect(ids({ sort: "title" })).toBe("cba");
  });
});

describe("the rest", () => {
  it("closed wins over expired", () => {
    const now = new Date("2027-02-01T00:00:00Z");
    expect(listingState(listing({}), new Date("2026-11-05T00:00:00Z"))).toBe("open");
    expect(listingState(listing({}), now)).toBe("expired");
    expect(listingState(listing({ status: "closed" }), now)).toBe("closed");
  });
  it("pages stay in range", () => {
    const items = Array.from({ length: 45 }, (_, i) => i);
    expect(pageOf(items, 3)).toMatchObject({ pages: 3, current: 3, from: 41, to: 45 });
    expect(pageOf(items, 9).current).toBe(3);
    expect(pageOf([], 1)).toMatchObject({ pages: 1, from: 0, to: 0 });
  });
  it("the email link can't carry extra headers", () => {
    expect(contactMailto("a@example.test", "Keg & tap")).toBe("mailto:a@example.test?subject=Guild%20marketplace%3A%20Keg%20%26%20tap");
    expect(contactMailto("a?bcc=x@example.test", "t")).not.toContain("?bcc");
  });
});
