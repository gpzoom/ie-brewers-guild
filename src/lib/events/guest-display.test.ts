import { describe, expect, it } from "vitest";
import type { EventRow } from "@/lib/supabase/types";
import { dedupeFoodSlots, eventDisplayTitle, guestEventsForHost, isFoodCategory } from "./guest-display";

const ev = (o: Partial<EventRow>): EventRow => ({
  id: "e", member_id: "m", calendar_connection_id: null, source: "manual", kind: "event", external_event_id: null,
  title: null, description: null, starts_at: "2026-10-09T00:00:00Z", ends_at: "2026-10-09T04:00:00Z", all_day: false,
  venue_name: "Mars Brewing Co.", city: null, address: null, overlay_status: null, overlay_starts_at: null,
  overlay_note: null, overlay_set_at: null, is_hidden: false, ...o,
});
const truck = { name: "Sample Taco Truck", slug: "taco", tag: "FOOD TRUCK", food: true };

describe("isFoodCategory", () => {
  it("first category decides", () => {
    expect(isFoodCategory([{ name: "Food Truck", slug: "food-truck", sort_order: 1 }])).toBe(true);
    expect(isFoodCategory([{ name: "Pop-up Food Vendor", slug: "pop-up-food-vendor", sort_order: 1 }])).toBe(true);
    expect(isFoodCategory([{ name: "Entertainment", slug: "entertainment", sort_order: 0 }, { name: "Food Truck", slug: "food-truck", sort_order: 1 }])).toBe(false);
    expect(isFoodCategory([])).toBe(false);
  });
});

describe("guestEventsForHost", () => {
  it("keeps live stops, drops canceled, postponed and hidden ones", () => {
    const out = guestEventsForHost([
      { event: ev({ id: "a" }), guest: truck },
      { event: ev({ id: "b", overlay_status: "canceled" }), guest: truck },
      { event: ev({ id: "c", overlay_status: "postponed" }), guest: truck },
      { event: ev({ id: "d", is_hidden: true }), guest: truck },
    ]);
    expect(out.map((e) => e.id)).toEqual(["a"]);
    expect(out[0].guest?.slug).toBe("taco");
  });
});

describe("dedupeFoodSlots", () => {
  it("the taproom's own entry for the same vendor on the same day gives way to the Guild entry", () => {
    const own = [ev({ id: "own", kind: "food", title: "Sample Taco Truck Co.", starts_at: "2026-10-09T01:00:00Z" }), ev({ id: "other", kind: "food", title: "Pizza Pied Piper" })];
    const guests = [{ ...ev({ id: "g" }), guest: truck }];
    const r = dedupeFoodSlots(own, guests, "America/Los_Angeles");
    expect(r.own.map((e) => e.id)).toEqual(["other"]);
    expect(r.guests.map((e) => e.id)).toEqual(["g"]);
  });
});

describe("eventDisplayTitle", () => {
  it("the event's own title, else the guest's name, else the venue", () => {
    expect(eventDisplayTitle({ title: "Karaoke Night", venue_name: "Mars", guest: truck })).toBe("Karaoke Night");
    expect(eventDisplayTitle({ title: null, venue_name: "Mars", guest: truck })).toBe("Sample Taco Truck");
    expect(eventDisplayTitle({ title: null, venue_name: "Mars" })).toBe("Mars");
    expect(eventDisplayTitle({ title: null, venue_name: null })).toBeNull();
  });
});
