import { describe, expect, it } from "vitest";
import { decideGuestLinks, type GuestStop } from "./guest-links";

const NOW = new Date("2026-10-07T18:00:00Z");
const hosts = [
  { id: "mars", name: "Mars Brewing Co.", slug: "mars", city: "Rancho Cucamonga", street: "9728 6th St" },
  { id: "sample", name: "Sample Brewing Co.", slug: "sample", city: "Riverside", street: "3750 Main Street" },
];
const stop = (o: Partial<GuestStop>): GuestStop => ({
  id: "e1", member_id: "truck", venue_name: "Mars Brewing Co.", address: null, city: null,
  starts_at: "2026-10-09T00:00:00Z", ends_at: "2026-10-09T04:00:00Z", all_day: false,
  overlay_status: null, overlay_starts_at: null, ...o,
});

describe("decideGuestLinks", () => {
  it("a new stop at a taproom: link it, shown", () => {
    expect(decideGuestLinks({ stops: [stop({})], hosts, existing: [], now: NOW })).toEqual({
      upserts: [{ event_id: "e1", host_member_id: "mars", status: "shown" }], deletes: [],
    });
  });

  it("same taproom as before: nothing to do (a hide is kept; both Workers running agree)", () => {
    const r = decideGuestLinks({ stops: [stop({})], hosts, existing: [{ event_id: "e1", host_member_id: "mars", status: "hidden" }], now: NOW });
    expect(r).toEqual({ upserts: [], deletes: [] });
  });

  it("moved to another taproom: relinked and shown there (the old hide doesn't follow)", () => {
    const r = decideGuestLinks({
      stops: [stop({ venue_name: "Sample Brewing Co." })], hosts,
      existing: [{ event_id: "e1", host_member_id: "mars", status: "hidden" }], now: NOW,
    });
    expect(r.upserts).toEqual([{ event_id: "e1", host_member_id: "sample", status: "shown" }]);
  });

  it("no longer at a taproom: unlinked", () => {
    const r = decideGuestLinks({
      stops: [stop({ venue_name: "Downtown farmers market" })], hosts,
      existing: [{ event_id: "e1", host_member_id: "mars", status: "shown" }], now: NOW,
    });
    expect(r).toEqual({ upserts: [], deletes: ["e1"] });
  });

  it("canceled stays linked (places that show it skip canceled ones)", () => {
    const r = decideGuestLinks({ stops: [stop({ overlay_status: "canceled" })], hosts, existing: [], now: NOW });
    expect(r.upserts).toHaveLength(1);
  });

  it("past stops and stops more than 60 days out are left alone", () => {
    const past = stop({ id: "old", starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-10-01T03:00:00Z" });
    const far = stop({ id: "far", starts_at: "2026-12-20T00:00:00Z", ends_at: null });
    const r = decideGuestLinks({
      stops: [past, far], hosts,
      existing: [{ event_id: "old", host_member_id: "sample", status: "shown" }], now: NOW,
    });
    expect(r).toEqual({ upserts: [], deletes: [] });
  });

  it("a stop with no end counts as on for 2 hours", () => {
    const justStarted = stop({ starts_at: "2026-10-07T17:00:00Z", ends_at: null });
    expect(decideGuestLinks({ stops: [justStarted], hosts, existing: [], now: NOW }).upserts).toHaveLength(1);
  });
});
