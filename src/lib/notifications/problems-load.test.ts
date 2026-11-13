import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, opsOf } from "@/lib/events/fake-supabase.test-helper";
import { loadProblemInputs } from "./problems-load";

const NOW = new Date("2026-11-13T18:00:00Z");

const event = {
  id: "e1",
  member_id: "mars",
  title: "Thanksgiving Trivia",
  venue_name: null,
  address: null,
  city: null,
  starts_at: "2026-11-27T02:00:00Z",
  ends_at: null,
  all_day: false,
  overlay_status: null,
  overlay_starts_at: null,
  is_hidden: false,
};
const openRow = (type: string, id: string) => ({
  id,
  type,
  kind: "problem",
  member_id: "mars",
  dedupe_key: `${type}:${id}`,
  details: {},
  event_id: null,
  due_date: null,
  recipient_roles: ["owner"],
  email_mode: "batched",
  reminder_days: null,
  status: "open",
  quiet: false,
  created_at: NOW.toISOString(),
  resolved_at: null,
  read_at: null,
  notice_sent_at: null,
  reminder_sent_at: null,
  claimed_at: null,
  attempts: 0,
  last_error: null,
});

const tables = {
  members: [
    {
      id: "mars",
      business_name: "Mars Brewing",
      member_type: "producer",
      timezone: "America/Los_Angeles",
      status: "published",
    },
    {
      id: "shop",
      business_name: "Allied Shop",
      member_type: "allied",
      timezone: "America/Los_Angeles",
      status: "published",
    },
    {
      id: "truck",
      business_name: "Tipzy",
      member_type: "mobile",
      timezone: "America/Los_Angeles",
      status: "published",
    },
    {
      id: "draft",
      business_name: "Draft Brewing",
      member_type: "producer",
      timezone: "America/Los_Angeles",
      status: "draft",
    },
  ],
  special_hours: [{ member_id: "mars", date: "2026-11-26", note: "Thanksgiving" }],
  // As PostgREST returns it: the one-to-one link embedded as an object or null.
  events: [
    { ...event, event_hosts: { event_id: "e1", host_member_id: "mars" } },
    { ...event, id: "e2", event_hosts: null },
  ],
  calendar_connections: [
    {
      id: "c1",
      member_id: "mars",
      purpose: "events",
      feed_time_zone: "UTC",
      feed_has_timed_events: true,
    },
  ],
  member_notifications: [openRow("closed_day_conflict", "n1"), openRow("utc_calendar", "n2")],
};

describe("loadProblemInputs", () => {
  it("reads only closed special hours of published producers and allied members, in the window", async () => {
    const { client, calls } = fakeSupabase(tables);
    await loadProblemInputs(client, NOW);
    const ops = opsOf(calls, "special_hours");
    expect(ops).toContainEqual(["eq", ["is_closed", true]]);
    expect(ops).toContainEqual(["in", ["member_id", ["mars", "shop"]]]);
    expect(ops).toContainEqual(["gte", ["date", "2026-11-12"]]);
    expect(ops).toContainEqual(["lte", ["date", "2027-01-13"]]);
  });

  it("reads only kind = 'event' events in the upcoming window, of any member type", async () => {
    const { client, calls } = fakeSupabase(tables);
    await loadProblemInputs(client, NOW);
    const ops = opsOf(calls, "events");
    expect(ops).toContainEqual(["eq", ["kind", "event"]]);
    expect(ops.some(([op]) => op === "in")).toBe(false);
    const or = ops.find(([op]) => op === "or");
    expect(String(or![1][0])).toMatch(/starts_at\.gte\..*starts_at\.lt\./);
  });

  it("reads the links embedded in the events read, whatever their status, never by a list of ids", async () => {
    const { client, calls } = fakeSupabase(tables);
    await loadProblemInputs(client, NOW);
    const select = opsOf(calls, "events").find(([op]) => op === "select");
    expect(String(select![1][0])).toContain("event_hosts(event_id, host_member_id)");
    expect(String(select![1][0])).not.toMatch(/event_hosts\([^)]*status/);
    expect(calls.some((c) => c.table === "event_hosts")).toBe(false);
  });

  it("also takes an embedded link given as an array", async () => {
    const { client } = fakeSupabase({
      ...tables,
      events: [{ ...event, event_hosts: [{ event_id: "e1", host_member_id: "shop" }] }],
    });
    const out = await loadProblemInputs(client, NOW);
    expect(out.links).toEqual([{ event_id: "e1", host_member_id: "shop" }]);
  });

  it("warns when the events read hits the 1000-row cap", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const many = Array.from({ length: 1000 }, (_, n) => ({
        ...event,
        id: `e${n}`,
        event_hosts: null,
      }));
      const { client } = fakeSupabase({ ...tables, events: many });
      await loadProblemInputs(client, NOW);
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockClear();
      const { client: small } = fakeSupabase({ ...tables, events: many.slice(1) });
      await loadProblemInputs(small, NOW);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("reads only open problem rows", async () => {
    const { client, calls } = fakeSupabase(tables);
    await loadProblemInputs(client, NOW);
    const ops = opsOf(calls, "member_notifications");
    expect(ops).toContainEqual(["eq", ["kind", "problem"]]);
    expect(ops).toContainEqual(["eq", ["status", "open"]]);
  });

  it("maps the rows into the decide functions' inputs", async () => {
    const { client } = fakeSupabase(tables);
    const out = await loadProblemInputs(client, NOW);
    expect(out.closedDays).toEqual([
      { member_id: "mars", date: "2026-11-26", note: "Thanksgiving" },
    ]);
    expect(out.members.get("mars")).toEqual({
      id: "mars",
      name: "Mars Brewing",
      type: "producer",
      timezone: "America/Los_Angeles",
      published: true,
    });
    expect(out.members.get("draft")?.published).toBe(false);
    expect(out.members.get("truck")?.type).toBe("mobile");
    expect(out.events).toEqual([event, { ...event, id: "e2" }]);
    expect(out.links).toEqual([{ event_id: "e1", host_member_id: "mars" }]);
    expect(out.connections).toEqual(tables.calendar_connections);
    expect(out.openRows.map((r) => r.id)).toEqual(["n1"]);
    expect(out.utcOpenRows.map((r) => r.id)).toEqual(["n2"]);
  });

  it("skips the special-hours read when no member can be closed", async () => {
    const { client, calls } = fakeSupabase({ ...tables, members: [], events: [] });
    const out = await loadProblemInputs(client, NOW);
    expect(calls.some((c) => c.table === "special_hours")).toBe(false);
    expect(out.closedDays).toEqual([]);
    expect(out.links).toEqual([]);
  });
});
