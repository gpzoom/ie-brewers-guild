import { describe, expect, it } from "vitest";
import { statusFor, visitView } from "./visit-link";

const NOW = new Date("2026-10-07T18:00:00Z");
const base = {
  hostId: "mars", guestName: "Rolling Smoke BBQ", taproomName: "Bob's Brewery", timezone: "America/Los_Angeles", now: NOW,
  event: { starts_at: "2026-10-09T00:00:00Z", ends_at: "2026-10-09T04:00:00Z", overlay_starts_at: null, overlay_status: null, title: null, all_day: false },
};
describe("visitView", () => {
  it("a waiting visit: ready to approve", () => {
    expect(visitView({ ...base, action: "approve", link: { status: "pending", host_member_id: "mars" } }).state).toBe("ready");
  });
  it("already answered on the Events page", () => {
    expect(visitView({ ...base, action: "approve", link: { status: "shown", host_member_id: "mars" } }).state).toBe("answered");
    expect(visitView({ ...base, action: "decline", link: { status: "hidden", host_member_id: "mars" } }).state).toBe("answered");
    expect(visitView({ ...base, action: "hide", link: { status: "declined", host_member_id: "mars" } }).state).toBe("answered");
  });
  it("hide a shown visit: ready", () => {
    expect(visitView({ ...base, action: "hide", link: { status: "shown", host_member_id: "mars" } }).state).toBe("ready");
  });
  it("gone: no link, another taproom, deleted, or over", () => {
    expect(visitView({ ...base, action: "approve", link: null }).state).toBe("gone");
    expect(visitView({ ...base, action: "approve", link: { status: "pending", host_member_id: "sample" } }).state).toBe("gone");
    expect(visitView({ ...base, action: "approve", event: null, link: { status: "pending", host_member_id: "mars" } }).state).toBe("gone");
    expect(visitView({ ...base, action: "approve", now: new Date("2026-10-10T00:00:00Z"), link: { status: "pending", host_member_id: "mars" } }).state).toBe("gone");
  });
  it("statusFor", () => {
    expect([statusFor("approve"), statusFor("decline"), statusFor("hide")]).toEqual(["shown", "declined", "hidden"]);
  });
});
