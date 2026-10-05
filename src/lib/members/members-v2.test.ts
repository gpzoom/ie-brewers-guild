import { describe, expect, it } from "vitest";
import { buildDirectoryMembers, type DirectoryMemberRow } from "./directory";
import { buildV2 } from "./members-v2";
import type { StopEvent } from "./mobile-stops";

function row(o: Partial<DirectoryMemberRow>): DirectoryMemberRow {
  return {
    id: "p1", slug: "all-points", member_type: "producer", business_name: "All Points Brewing Co.",
    city: "Riverside", state: "CA", street_address: "2023 Chicago Ave Unit B8", postal_code: "92507",
    latitude: 33.977, longitude: -117.353, logo_asset_id: null, ...o,
  };
}
const NOW = new Date("2026-10-05T22:00:00Z");
const rows = [
  row({}),
  row({ id: "t1", slug: "taco", member_type: "mobile", business_name: "Sample Taco Truck", street_address: null, latitude: null, longitude: null }),
];
const members = buildDirectoryMembers({ rows, links: [], logoUrls: new Map() });
const truckStop: StopEvent = {
  id: "e1", member_id: "t1", title: null, venue_name: "All Points Brewing Co.", city: "Riverside", address: null,
  starts_at: "2026-10-06T00:00:00Z", ends_at: "2026-10-06T04:00:00Z", all_day: false, overlay_status: null,
  overlay_starts_at: null, is_hidden: false, latitude: null, longitude: null, geocoded_address: null,
};

describe("buildV2", () => {
  const v2 = buildV2({
    members,
    rows,
    categoriesByMemberId: new Map([["t1", [{ name: "Food Truck", slug: "food-truck", sort_order: 1 }]]]),
    stopsByMemberId: new Map([["t1", [truckStop]]]),
    now: NOW,
  });

  it("producers: no tag, no stop; one location pin each", () => {
    const ap = v2.cards.find((c) => c.name === "All Points Brewing Co.")!;
    expect(ap.tag).toBeNull();
    expect(ap.stop).toBeNull();
    expect(v2.pins.filter((p) => p.cardKey === ap.key && p.kind === "location")).toHaveLength(1);
  });

  it("a mobile member: category tag and icon, today's stop, and a mobile pin beside the host", () => {
    const truck = v2.cards.find((c) => c.name === "Sample Taco Truck")!;
    expect(truck.tag).toBe("FOOD TRUCK");
    expect(truck.mobileIcon).toBe("truck");
    expect(truck.stop).toEqual({ state: "at-member", hostName: "All Points Brewing Co.", time: "5–9 pm" });
    const pin = v2.pins.find((p) => p.cardKey === truck.key)!;
    expect(pin.kind).toBe("mobile");
    expect(pin.icon).toBe("truck");
    expect(pin.lng).toBeGreaterThan(-117.353);
    expect(pin.stopLine).toBe("Today 5–9 pm at All Points Brewing Co.");
  });

  it("an Allied Member is tagged ALLIED", () => {
    const allied = buildDirectoryMembers({ rows: [row({ id: "a1", slug: "supply", member_type: "allied", business_name: "Sample Supply Co." })], links: [], logoUrls: new Map() });
    const r = buildV2({ members: allied, rows: [row({ id: "a1", slug: "supply", member_type: "allied", business_name: "Sample Supply Co." })], categoriesByMemberId: new Map(), stopsByMemberId: new Map(), now: NOW });
    expect(r.cards[0].tag).toBe("ALLIED");
  });
});
