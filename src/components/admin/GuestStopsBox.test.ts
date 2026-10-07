import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GuestStopRow } from "@/lib/events/guest-stops";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, className }: { children: unknown; to: string; params?: { slug: string }; className?: string }) =>
    createElement("a", { href: to.replace("$slug", params?.slug ?? ""), className }, children as never),
}));
vi.mock("@/lib/events/guest-stops.server", () => ({ listGuestStops: vi.fn(), setGuestStopStatus: vi.fn() }));

const { GuestStopsList } = await import("./GuestStopsBox");

const row = (o: Partial<GuestStopRow>): GuestStopRow => ({
  eventId: "e1", guestName: "Sample Taco Truck", guestSlug: "taco", tag: "FOOD TRUCK", food: true, title: null,
  startsAt: "2026-10-09T01:00:00Z", endsAt: "2026-10-09T04:00:00Z", allDay: false, status: "shown", ...o,
});
const render = (stops: GuestStopRow[]) =>
  renderToStaticMarkup(
    createElement(GuestStopsList, { stops, timezone: "America/Los_Angeles", street: "3750 Main Street", onToggle: () => {} }),
  );

describe("GuestStopsList (GV1)", () => {
  it("the heading and the taproom's street", () => {
    const html = render([]);
    expect(html).toContain("Guild members at your taproom");
    expect(html).toContain("3750 Main Street");
  });
  it("a shown stop: 'On your page' and Hide; the guest links to their profile", () => {
    const html = render([row({})]);
    expect(html).toContain("On your page");
    expect(html).toContain(">Hide<");
    expect(html).toMatch(/<a href="\/members\/taco"[^>]*>Sample Taco Truck<\/a>/);
    expect(html).toContain("GUILD MEMBER");
    expect(html).toContain("from their schedule");
  });
  it("a hidden stop: 'Hidden from your page' and Show", () => {
    const html = render([row({ status: "hidden", title: "Karaoke Night" })]);
    expect(html).toContain("Hidden from your page");
    expect(html).toContain(">Show<");
    expect(html).toContain("Karaoke Night");
  });
  it("none yet", () => {
    expect(render([])).toContain("No Guild members have listed a stop here yet.");
  });
});
