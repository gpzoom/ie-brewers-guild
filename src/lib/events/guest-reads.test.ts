import { describe, expect, it } from "vitest";
import { fakeSupabase, opsOf } from "./fake-supabase.test-helper";
import { loadGuestEventsForHost, loadGuestStopRows } from "./guest-info";
import { loadLinkerInputs } from "./guest-links-load";

const NOW = new Date("2026-10-07T18:00:00Z");
const event = {
  id: "e1", member_id: "truck", calendar_connection_id: null, source: "manual", kind: "event", external_event_id: null,
  title: null, description: null, starts_at: "2026-10-09T01:00:00Z", ends_at: "2026-10-09T04:00:00Z", all_day: false,
  venue_name: "Mars Brewing Co.", city: null, address: null, overlay_status: null, overlay_starts_at: null,
  overlay_note: null, overlay_set_at: null, is_hidden: false,
};
const guestTables = {
  members: [{ id: "truck", slug: "taco", business_name: "Sample Taco Truck" }],
  member_categories: [{ member_id: "truck", category_id: "c1" }],
  categories: [{ id: "c1", name: "Food Truck", slug: "food-truck", sort_order: 0 }],
};

// A taproom's links pile up over the years: every read is bounded to
// upcoming stops in one query, never a list of every event id in the URL.
function expectUpcomingWindow(ops: Array<[string, unknown[]]>, referencedTable?: string) {
  const or = ops.find(([op]) => op === "or");
  expect(or, "an .or() date window").toBeTruthy();
  expect(String(or![1][0])).toMatch(/starts_at\.gte\..*starts_at\.lt\./);
  if (referencedTable) expect(or![1][1]).toEqual({ referencedTable });
}

describe("bounded reads (Guild Mobile members at taprooms)", () => {
  it("the taproom's profile: shown links joined to upcoming events, in one query", async () => {
    const { client, calls } = fakeSupabase({ ...guestTables, event_hosts: [{ event_id: "e1", status: "shown", events: event }] });
    const out = await loadGuestEventsForHost(client, "mars", NOW);
    expect(out.map((e) => [e.id, e.guest?.slug])).toEqual([["e1", "taco"]]);
    expectUpcomingWindow(opsOf(calls, "event_hosts"), "events");
    expect(opsOf(calls, "event_hosts")).toContainEqual(["eq", ["status", "shown"]]);
    expect(calls.some((c) => c.table === "events")).toBe(false);
  });

  it("the Events box: all upcoming links, hidden included, in one query", async () => {
    const { client, calls } = fakeSupabase({ ...guestTables, event_hosts: [{ event_id: "e1", status: "hidden", events: event }] });
    const rows = await loadGuestStopRows(client, "mars", NOW);
    expect(rows.map((r) => [r.eventId, r.status])).toEqual([["e1", "hidden"]]);
    expectUpcomingWindow(opsOf(calls, "event_hosts"), "events");
    expect(calls.some((c) => c.table === "events")).toBe(false);
  });

  it("the linker: only stops in the linking window are read", async () => {
    const { client, calls } = fakeSupabase({
      members: [{ id: "truck" }],
      events: [event],
      event_hosts: [],
    });
    const inputs = await loadLinkerInputs(client, { memberId: "truck" }, NOW);
    expect(inputs?.stops.map((s) => s.id)).toEqual(["e1"]);
    expectUpcomingWindow(opsOf(calls, "events"));
  });
});
