import { describe, expect, it } from "vitest";
import { buildJoinPreviewProfile } from "./join-preview";
import type { PlaceProfile } from "@/lib/google/place-profile";

const now = new Date("2026-11-15T12:00:00Z");
const profile: PlaceProfile = {
  placeId: "abc_123",
  businessName: "Mars Brewing Company",
  street_address: "1 Main St",
  city: "Riverside",
  state: "CA",
  postal_code: "92501",
  latitude: 33.9,
  longitude: -117.4,
  phone: "(951) 555-0100",
  website: "https://mars.example.com",
  tagline: "Small-batch beer.",
  hours: [
    { weekday: 1, opens_at: "12:00", closes_at: "20:00", closes_next_day: false, is_closed: false },
    { weekday: 2, opens_at: null, closes_at: null, closes_next_day: false, is_closed: true },
  ],
  permanentlyClosed: false,
};
const base = { businessName: "Mars Brewing", city: "Riverside", siteOrigin: "https://x.org", now };

describe("buildJoinPreviewProfile", () => {
  it("has no photos", () => {
    const d = buildJoinPreviewProfile({ ...base, memberType: "producer", profile });
    expect(d.coverAsset).toBeNull();
    expect(d.carouselSlides).toEqual([]);
    expect(d.logoPublicUrl).toBeNull();
    expect(d.logoAsset).toBeNull();
  });

  it("sets preview flag only and empty lists", () => {
    const d = buildJoinPreviewProfile({ ...base, memberType: "producer", profile });
    expect(d.isPreview).toBe(true);
    expect(d.isImpersonatedPreview).toBe(false);
    expect(d.isImpersonatingThisMember).toBe(false);
    expect(d.viewerIsEditor).toBe(false);
    expect(d.events).toEqual([]);
    expect(d.foodSlots).toEqual([]);
    expect(d.hasFoodCalendar).toBe(false);
    expect(d.member.status).toBe("applied");
    expect(d.member.theme).toBe("amber");
    expect(d.now).toBe(now.toISOString());
  });

  it("uses Google hours with synthetic ids and the website link", () => {
    const d = buildJoinPreviewProfile({ ...base, memberType: "producer", profile });
    expect(d.hours).toHaveLength(2);
    expect(d.hours[0]).toMatchObject({ weekday: 1, opens_at: "12:00", is_closed: false });
    expect(new Set(d.hours.map((h) => h.id)).size).toBe(2);
    expect(d.links).toHaveLength(1);
    expect(d.links[0]).toMatchObject({ kind: "website", url: "https://mars.example.com" });
    expect(d.member.phone).toBe("(951) 555-0100");
    expect(d.member.tagline).toBe("Small-batch beer.");
    expect(d.member.street_address).toBe("1 Main St");
  });

  it("falls back to typed fields without a profile", () => {
    const d = buildJoinPreviewProfile({ ...base, memberType: "producer", profile: null });
    expect(d.member.business_name).toBe("Mars Brewing");
    expect(d.member.city).toBe("Riverside");
    expect(d.hours).toEqual([]);
    expect(d.links).toEqual([]);
  });

  it("Mobile with no profile is name and city only", () => {
    const d = buildJoinPreviewProfile({ ...base, memberType: "mobile", profile: null });
    expect(d.member.member_type).toBe("mobile");
    expect(d.member.business_name).toBe("Mars Brewing");
    expect(d.member.city).toBe("Riverside");
    expect(d.member.phone).toBeNull();
    expect(d.member.tagline).toBeNull();
    expect(d.hours).toEqual([]);
    expect(d.links).toEqual([]);
  });
});
