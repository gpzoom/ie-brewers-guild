import { describe, expect, it } from "vitest";
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
  events: [event],
  event_hosts: [{ event_id: "e1", host_member_id: "mars", status: "shown" }],
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

  it("reads the links of those events, whatever their status", async () => {
    const { client, calls } = fakeSupabase(tables);
    await loadProblemInputs(client, NOW);
    const ops = opsOf(calls, "event_hosts");
    expect(ops).toContainEqual(["in", ["event_id", ["e1"]]]);
    expect(ops.some(([op, args]) => op === "eq" && args[0] === "status")).toBe(false);
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
    expect(out.events).toEqual([event]);
    expect(out.links).toEqual([{ event_id: "e1", host_member_id: "mars" }]);
    expect(out.connections).toEqual(tables.calendar_connections);
    expect(out.openRows.map((r) => r.id)).toEqual(["n1"]);
    expect(out.utcOpenRows.map((r) => r.id)).toEqual(["n2"]);
  });

  it("skips the special-hours and link reads when there is nothing to read", async () => {
    const { client, calls } = fakeSupabase({ ...tables, members: [], events: [] });
    const out = await loadProblemInputs(client, NOW);
    expect(calls.some((c) => c.table === "special_hours")).toBe(false);
    expect(calls.some((c) => c.table === "event_hosts")).toBe(false);
    expect(out.closedDays).toEqual([]);
    expect(out.links).toEqual([]);
  });
});
