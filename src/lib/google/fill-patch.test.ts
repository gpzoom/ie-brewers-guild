import { describe, expect, it } from "vitest";
import { computeFillPatch } from "./fill-patch";
import type { BasicsDraft, DraftHours, LinksDraft } from "@/lib/drafts/sections";
import type { PlaceProfile } from "./place-profile";

const hours: DraftHours[] = [
  { weekday: 1, opens_at: "12:00", closes_at: "21:00", closes_next_day: false, is_closed: false },
];

function basics(over: Partial<BasicsDraft> = {}): BasicsDraft {
  return {
    business_name: "Test Brewing",
    tagline: null,
    city: "Redlands",
    state: "CA",
    street_address: null,
    postal_code: null,
    latitude: null,
    longitude: null,
    service_area: null,
    lead_time: null,
    member_since_year: null,
    timezone: "America/Los_Angeles",
    phone: null,
    contact_email: null,
    logo_asset_id: null,
    hours: [],
    special_hours: [],
    ...over,
  } as BasicsDraft;
}

const profile: PlaceProfile = {
  placeId: "abc",
  businessName: "Test Brewing",
  street_address: "123 Main Street",
  city: "Redlands",
  state: "CA",
  postal_code: "92373",
  latitude: 34.05,
  longitude: -117.18,
  phone: "(909) 555-0100",
  website: "https://example.com",
  tagline: "Small-batch ales",
  hours,
  permanentlyClosed: false,
};

const noLinks: LinksDraft = { links: [] };

describe("computeFillPatch", () => {
  it("fills nothing at all for a permanently closed place", () => {
    const r = computeFillPatch(basics(), noLinks, { ...profile, permanentlyClosed: true });
    expect(r).toEqual({ basics: {}, links: null, filled: [], kept: [] });
  });

  it("fills all five fields on an empty draft, address written as a block", () => {
    const r = computeFillPatch(basics(), noLinks, profile);
    expect(r.filled).toEqual(["address", "phone", "tagline", "hours", "website"]);
    expect(r.kept).toEqual([]);
    expect(r.basics).toEqual({
      street_address: "123 Main Street",
      city: "Redlands",
      state: "CA",
      postal_code: "92373",
      latitude: 34.05,
      longitude: -117.18,
      phone: "(909) 555-0100",
      tagline: "Small-batch ales",
      hours,
    });
    expect(r.links).toEqual({
      links: [{ kind: "website", label: null, url: "https://example.com", sort_order: 0 }],
    });
  });

  it("keeps the address when a street address is already set", () => {
    const r = computeFillPatch(basics({ street_address: "9 Oak Ave" }), noLinks, profile);
    expect(r.kept).toContain("address");
    expect(r.filled).not.toContain("address");
    for (const k of ["street_address", "city", "state", "postal_code", "latitude", "longitude"]) {
      expect(r.basics).not.toHaveProperty(k);
    }
  });

  it("keeps non-empty hours; Google with no hours is neither filled nor kept", () => {
    const kept = computeFillPatch(basics({ hours }), noLinks, profile);
    expect(kept.kept).toContain("hours");
    expect(kept.basics).not.toHaveProperty("hours");
    const none = computeFillPatch(basics(), noLinks, { ...profile, hours: null });
    expect(none.filled).not.toContain("hours");
    expect(none.kept).not.toContain("hours");
    const noneKept = computeFillPatch(basics({ hours }), noLinks, { ...profile, hours: null });
    expect(noneKept.kept).not.toContain("hours");
  });

  it("keeps an existing website link, else appends one", () => {
    const existing: LinksDraft = {
      links: [{ kind: "website", label: null, url: "https://mine.com", sort_order: 0 }],
    };
    const k = computeFillPatch(basics(), existing, profile);
    expect(k.kept).toContain("website");
    expect(k.links).toBeNull();
    const other: LinksDraft = {
      links: [{ kind: "instagram", label: null, url: "https://instagram.com/x", sort_order: 0 }],
    };
    const a = computeFillPatch(basics(), other, profile);
    expect(a.links?.links).toHaveLength(2);
    expect(a.links?.links[1]).toEqual({
      kind: "website",
      label: null,
      url: "https://example.com",
      sort_order: 1,
    });
  });

  it("keeps phone and tagline when non-empty", () => {
    const r = computeFillPatch(basics({ phone: "555", tagline: "Mine" }), noLinks, profile);
    expect(r.kept).toEqual(expect.arrayContaining(["phone", "tagline"]));
    expect(r.basics).not.toHaveProperty("phone");
    expect(r.basics).not.toHaveProperty("tagline");
  });

  it("skips fields Google lacks", () => {
    const r = computeFillPatch(basics(), noLinks, {
      ...profile,
      street_address: null,
      phone: null,
      tagline: null,
      website: null,
      hours: null,
    });
    expect(r.filled).toEqual([]);
    expect(r.basics).toEqual({});
    expect(r.links).toBeNull();
  });
});
