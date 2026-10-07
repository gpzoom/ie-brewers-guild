import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ProfileEvent } from "@/lib/events/guest-display";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, className }: { children: unknown; to: string; params?: { slug: string }; className?: string }) =>
    createElement("a", { href: to.replace("$slug", params?.slug ?? ""), className }, children as never),
}));

const { EventsModule } = await import("./EventsModule");

const ev = (o: Partial<ProfileEvent>): ProfileEvent => ({
  id: "e", member_id: "t", calendar_connection_id: null, source: "manual", kind: "event", external_event_id: null,
  title: null, description: null, starts_at: "2026-10-09T01:00:00Z", ends_at: "2026-10-09T04:00:00Z", all_day: false,
  venue_name: "Mars Brewing Co.", city: null, address: null, overlay_status: null, overlay_starts_at: null,
  overlay_note: null, overlay_set_at: null, is_hidden: false, ...o,
});
const truck = { name: "Sample Taco Truck", slug: "taco", tag: "FOOD TRUCK", food: true };
const render = (events: ProfileEvent[], memberType: "producer" | "mobile" = "producer") =>
  renderToStaticMarkup(createElement(EventsModule, { events, memberType, timezone: "America/Los_Angeles" }));

describe("EventsModule: Guild members at the taproom", () => {
  it("a guest stop with no title: the guest's name, linked, with GUILD MEMBER and its category", () => {
    const html = render([ev({ guest: truck })]);
    expect(html).toContain('href="/members/taco"');
    expect(html).toContain("Sample Taco Truck");
    expect(html).toContain("GUILD MEMBER");
    expect(html).toContain("food truck");
    expect(html).not.toContain(">Mars Brewing Co.<");
  });
  it("a guest stop with its own title: the title, then 'with' the linked guest", () => {
    const html = render([ev({ title: "Karaoke Night", guest: truck })]);
    expect(html).toContain("Karaoke Night");
    expect(html).toMatch(/with <a href="\/members\/taco"[^>]*>Sample Taco Truck<\/a>/);
    expect(html).toContain("GUILD MEMBER");
  });
  it("the taproom's own events are unchanged", () => {
    const html = render([ev({ title: "Trivia", venue_name: null, member_id: "mars" })]);
    expect(html).toContain("Trivia");
    expect(html).not.toContain("GUILD MEMBER");
  });
});
