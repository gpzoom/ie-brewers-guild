import { describe, expect, it } from "vitest";
import { decideGuestLinks, type ExistingLink, type GuestStop, type LinkHost, type LinkWrite } from "./guest-links";

const NOW = new Date("2026-10-07T18:00:00Z");
const hosts: LinkHost[] = [
  { id: "mars", name: "Mars Brewing Co.", slug: "mars", city: "Rancho Cucamonga", street: "9728 6th St", mode: "show" },
  { id: "sample", name: "Sample Brewing Co.", slug: "sample", city: "Riverside", street: "3750 Main Street", mode: "show" },
];
const stop = (o: Partial<GuestStop>): GuestStop => ({
  id: "e1", member_id: "truck", title: null, venue_name: "Mars Brewing Co.", address: null, city: null,
  starts_at: "2026-10-09T00:00:00Z", ends_at: "2026-10-09T04:00:00Z", all_day: false,
  overlay_status: null, overlay_starts_at: null, is_hidden: false, ...o,
});
const W = (o: Partial<LinkWrite>): LinkWrite => ({
  event_id: "e1", host_member_id: "mars", status: "shown", guest_name: "Sample Taco Truck", title: null,
  notified_starts_at: "2026-10-09T00:00:00Z", notified_ends_at: "2026-10-09T04:00:00Z", notified_all_day: false,
  cancel_notified: false, ...o,
});
const names = new Map([["truck", "Sample Taco Truck"]]);
const link = (o: Partial<ExistingLink>): ExistingLink => ({
  event_id: "e1", host_member_id: "mars", status: "shown", guest_name: "Sample Taco Truck", title: null,
  notified_starts_at: "2026-10-09T00:00:00Z", notified_ends_at: "2026-10-09T04:00:00Z", notified_all_day: false,
  cancel_notified: false, ...o,
});
const decideRaw = (stops: GuestStop[], existing: ExistingLink[] = [], h: LinkHost[] = hosts) =>
  decideGuestLinks({ stops, hosts: h, existing, guestNames: names, now: NOW });
// The tests below read the writes flattened: every link written, every email note, every link removed.
const decide = (stops: GuestStop[], existing: ExistingLink[] = [], h: LinkHost[] = hosts) => {
  const r = decideRaw(stops, existing, h);
  return { upserts: r.writes.map((w) => w.link), deletes: r.deletes.map((d) => d.event_id), notices: r.writes.flatMap((w) => w.notices) };
};

describe("decideGuestLinks", () => {
  it("a new stop at a taproom: link it, shown", () => {
    const r = decide([stop({})]);
    expect(r.upserts).toEqual([W({})]);
    expect(r.deletes).toEqual([]);
  });

  it("same taproom as before: nothing to do (a hide is kept; both Workers running agree)", () => {
    expect(decide([stop({})], [link({ status: "hidden" })])).toEqual({ upserts: [], deletes: [], notices: [] });
  });

  it("moved to another taproom: relinked and shown there (the old hide doesn't follow)", () => {
    const r = decide([stop({ venue_name: "Sample Brewing Co." })], [link({ status: "hidden" })]);
    expect(r.upserts).toEqual([W({ host_member_id: "sample" })]);
  });

  it("no longer at a taproom: unlinked", () => {
    const r = decide([stop({ venue_name: "Downtown farmers market" })], [link({})]);
    expect(r).toEqual({ upserts: [], deletes: ["e1"], notices: [] });
  });

  it("canceled stays linked (places that show it skip canceled ones)", () => {
    expect(decide([stop({ overlay_status: "canceled" })]).upserts).toHaveLength(1);
  });

  it("past stops and stops more than 60 days out are left alone", () => {
    const past = stop({ id: "old", starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-10-01T03:00:00Z" });
    const far = stop({ id: "far", starts_at: "2026-12-20T00:00:00Z", ends_at: null });
    expect(decide([past, far], [link({ event_id: "old", host_member_id: "sample" })])).toEqual({ upserts: [], deletes: [], notices: [] });
  });

  it("a stop with no end counts as on for 2 hours", () => {
    expect(decide([stop({ starts_at: "2026-10-07T17:00:00Z", ends_at: null })]).upserts).toHaveLength(1);
  });
});

describe("decideGuestLinks, Part 2 (Ask me first and notes)", () => {
  const askHosts = hosts.map((h) => (h.id === "mars" ? { ...h, mode: "ask" as const } : h));
  it("a new stop at a Show-right-away taproom: shown, with a 'new' note", () => {
    const r = decide([stop({})]);
    expect(r.upserts).toEqual([W({})]);
    expect(r.notices.map((n) => [n.kind, n.host_member_id])).toEqual([["new", "mars"]]);
  });
  it("a new stop at an Ask-me-first taproom: pending, with a 'request' note", () => {
    const r = decide([stop({})], [], askHosts);
    expect(r.upserts[0].status).toBe("pending");
    expect(r.notices.map((n) => n.kind)).toEqual(["request"]);
  });
  it("same taproom, nothing changed: no write, no note (switching modes never re-sends)", () => {
    expect(decide([stop({})], [link({ status: "pending" })])).toEqual({ upserts: [], deletes: [], notices: [] });
  });
  it("time changed: a 'changed' note with the old times; the status is kept", () => {
    const r = decide([stop({ starts_at: "2026-10-10T00:00:00Z", ends_at: "2026-10-10T04:00:00Z" })], [link({ status: "pending" })]);
    expect(r.upserts).toEqual([W({ status: "pending", notified_starts_at: "2026-10-10T00:00:00Z", notified_ends_at: "2026-10-10T04:00:00Z" })]);
    expect(r.notices[0]).toMatchObject({ kind: "changed", old_starts_at: "2026-10-09T00:00:00Z", starts_at: "2026-10-10T00:00:00Z" });
  });
  it("rescheduled counts as a change to its new start, with no end", () => {
    const r = decide([stop({ overlay_status: "rescheduled", overlay_starts_at: "2026-10-11T01:00:00Z" })], [link({})]);
    expect(r.notices[0]).toMatchObject({ kind: "changed", starts_at: "2026-10-11T01:00:00Z", ends_at: null });
  });
  it("canceled (or postponed, or hidden by the member): one 'canceled' note, once", () => {
    for (const o of [{ overlay_status: "canceled" }, { overlay_status: "postponed" }, { is_hidden: true }]) {
      const r = decide([stop(o)], [link({})]);
      expect(r.notices.map((n) => n.kind)).toEqual(["canceled"]);
      expect(r.upserts[0].cancel_notified).toBe(true);
    }
    expect(decide([stop({ overlay_status: "canceled" })], [link({ cancel_notified: true })]).notices).toEqual([]);
  });
  it("un-canceled: back on, with a fresh 'new' note", () => {
    const r = decide([stop({})], [link({ cancel_notified: true })]);
    expect(r.notices.map((n) => n.kind)).toEqual(["new"]);
    expect(r.upserts[0].cancel_notified).toBe(false);
  });
  it("hidden or declined: no notes for changes or cancels", () => {
    for (const status of ["hidden", "declined"] as const) {
      const r = decide([stop({ starts_at: "2026-10-10T00:00:00Z", overlay_status: "canceled" })], [link({ status })]);
      expect(r.notices).toEqual([]);
    }
  });
  it("moved from Mars (Ask me first) to Sample (Show): Mars gets 'canceled', Sample gets 'new'", () => {
    const r = decide([stop({ venue_name: "Sample Brewing Co." })], [link({ status: "pending" })], askHosts);
    expect(r.upserts).toEqual([W({ host_member_id: "sample", status: "shown" })]);
    expect(r.notices.map((n) => [n.kind, n.host_member_id])).toEqual([["canceled", "mars"], ["new", "sample"]]);
  });
  it("a stop created already canceled is linked quietly", () => {
    const r = decide([stop({ overlay_status: "canceled" })]);
    expect(r.notices).toEqual([]);
    expect(r.upserts[0].cancel_notified).toBe(true);
  });
  it("the guest's new title is kept in the snapshot, without an email", () => {
    const r = decide([stop({ title: "Taco Tuesday" })], [link({})]);
    expect(r.upserts).toEqual([W({ title: "Taco Tuesday" })]);
    expect(r.notices).toEqual([]);
  });
  it("a link from Part 1 (nothing told yet): its snapshot is recorded quietly, no email", () => {
    const r = decide([stop({})], [link({ guest_name: null, notified_starts_at: null, notified_ends_at: null })]);
    expect(r.notices).toEqual([]);
    expect(r.upserts).toEqual([W({})]);
  });
  it("a Part 1 link for a stop already canceled: recorded quietly as told-canceled, and no email on later runs", () => {
    const r = decide([stop({ overlay_status: "canceled" })], [link({ guest_name: null, notified_starts_at: null, notified_ends_at: null })]);
    expect(r.notices).toEqual([]);
    expect(r.upserts[0].cancel_notified).toBe(true);
    const next = decide([stop({ overlay_status: "canceled" })], [link({ cancel_notified: true })]);
    expect(next.notices).toEqual([]);
  });
});

describe("decideGuestLinks: each write says what it expects to find (so a racing run or a click in between wins)", () => {
  it("a new link expects no row; its email goes with it", () => {
    const [w] = decideRaw([stop({})]).writes;
    expect(w.expect).toBeNull();
    expect(w.notices.map((n) => n.kind)).toEqual(["new"]);
  });
  it("a same-taproom change expects the row as read, status included", () => {
    const [w] = decideRaw([stop({ starts_at: "2026-10-10T00:00:00Z" })], [link({ status: "pending" })]).writes;
    expect(w.expect).toEqual({
      host_member_id: "mars", status: "pending", notified_starts_at: "2026-10-09T00:00:00Z",
      notified_ends_at: "2026-10-09T04:00:00Z", cancel_notified: false,
    });
    expect(w.notices.map((n) => n.kind)).toEqual(["changed"]);
  });
  it("a move expects the old taproom's row; the old taproom's Canceled goes with the move", () => {
    const [w] = decideRaw([stop({ venue_name: "Sample Brewing Co." })], [link({})]).writes;
    expect(w.expect?.host_member_id).toBe("mars");
    expect(w.notices.map((n) => [n.kind, n.host_member_id])).toEqual([["canceled", "mars"], ["new", "sample"]]);
  });
  it("a removal names the taproom it expects", () => {
    expect(decideRaw([stop({ venue_name: "Downtown farmers market" })], [link({})]).deletes).toEqual([{ event_id: "e1", host_member_id: "mars" }]);
  });
});
