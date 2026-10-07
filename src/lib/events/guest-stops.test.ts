import { describe, expect, it } from "vitest";
import { buildGuestStopRows, toGuestSlot, type GuestStopEvent } from "./guest-stops";

const NOW = new Date("2026-10-07T18:00:00Z");
const ev = (o: Partial<GuestStopEvent>): GuestStopEvent => ({
  id: "e1", member_id: "truck", title: null, starts_at: "2026-10-09T01:00:00Z", ends_at: "2026-10-09T04:00:00Z",
  all_day: false, overlay_status: null, overlay_starts_at: null, is_hidden: false, ...o,
});
const guests = new Map([["truck", { name: "Sample Taco Truck", slug: "taco", tag: "FOOD TRUCK", food: true }]]);

describe("buildGuestStopRows (the Events-page box)", () => {
  it("upcoming linked stops, hidden ones included, oldest first", () => {
    const rows = buildGuestStopRows({
      links: [
        { event_id: "e2", status: "hidden" },
        { event_id: "e1", status: "shown" },
      ],
      events: [ev({ id: "e2", starts_at: "2026-10-10T01:00:00Z", ends_at: null, title: "Karaoke Night" }), ev({})],
      guests,
      now: NOW,
    });
    expect(rows.map((r) => [r.eventId, r.status])).toEqual([["e1", "shown"], ["e2", "hidden"]]);
    expect(rows[0]).toMatchObject({ guestName: "Sample Taco Truck", guestSlug: "taco", tag: "FOOD TRUCK", food: true, title: null });
    expect(rows[1].title).toBe("Karaoke Night");
  });
  it("past, canceled, postponed and member-hidden stops, and unknown guests, are left out; rescheduled counts at its new time", () => {
    const rows = buildGuestStopRows({
      links: ["past", "canc", "post", "hid", "who", "resch"].map((event_id) => ({ event_id, status: "shown" as const })),
      events: [
        ev({ id: "past", starts_at: "2026-10-01T01:00:00Z", ends_at: "2026-10-01T03:00:00Z" }),
        ev({ id: "canc", overlay_status: "canceled" }),
        ev({ id: "post", overlay_status: "postponed" }),
        ev({ id: "hid", is_hidden: true }),
        ev({ id: "who", member_id: "nobody" }),
        ev({ id: "resch", starts_at: "2026-10-01T01:00:00Z", overlay_status: "rescheduled", overlay_starts_at: "2026-10-12T01:00:00Z" }),
      ],
      guests,
      now: NOW,
    });
    expect(rows.map((r) => r.eventId)).toEqual(["resch"]);
    expect(rows[0].startsAt).toBe("2026-10-12T01:00:00Z");
    expect(rows[0].endsAt).toBeNull();
  });
});

describe("toGuestSlot (the Food page preview)", () => {
  it("a row becomes a food-week slot with its guest", () => {
    const [row] = buildGuestStopRows({ links: [{ event_id: "e1", status: "shown" }], events: [ev({})], guests, now: NOW });
    const slot = toGuestSlot(row);
    expect(slot.starts_at).toBe("2026-10-09T01:00:00Z");
    expect(slot.guest?.slug).toBe("taco");
  });
});
