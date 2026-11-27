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

describe("EventsModule: only the next 2 weeks, then See More", () => {
  const now = new Date("2026-12-01T20:00:00Z");
  const at = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
  const show = (events: ProfileEvent[]) =>
    renderToStaticMarkup(
      createElement(EventsModule, { events, memberType: "producer", timezone: "America/Los_Angeles", now }),
    );

  it("lists events in the next 14 days and hides later ones behind See More", () => {
    const html = show([
      ev({ id: "a", title: "Trivia", starts_at: at(2), ends_at: null }),
      ev({ id: "b", title: "Karaoke", starts_at: at(13.9), ends_at: null }),
      ev({ id: "c", title: "New Year Bash", starts_at: at(20), ends_at: null }),
    ]);
    expect(html).toContain("Trivia");
    expect(html).toContain("Karaoke");
    expect(html).not.toContain("New Year Bash");
    expect(html).toContain("See More");
  });

  it("no See More when everything is within 2 weeks", () => {
    const html = show([ev({ id: "a", title: "Trivia", starts_at: at(2), ends_at: null })]);
    expect(html).toContain("Trivia");
    expect(html).not.toContain("See More");
  });

  it("nothing in the next 2 weeks: shows the soonest event, then See More if there are others", () => {
    const html = show([
      ev({ id: "c", title: "New Year Bash", starts_at: at(20), ends_at: null }),
      ev({ id: "d", title: "Winter Market", starts_at: at(30), ends_at: null }),
    ]);
    expect(html).toContain("New Year Bash");
    expect(html).not.toContain("Winter Market");
    expect(html).toContain("See More");
  });

  it("a rescheduled event counts by its new date", () => {
    const html = show([
      ev({ id: "a", title: "Trivia", starts_at: at(2), ends_at: null }),
      ev({
        id: "r",
        title: "Moved Show",
        starts_at: at(3),
        ends_at: null,
        overlay_status: "rescheduled",
        overlay_starts_at: at(25),
      }),
    ]);
    expect(html).not.toContain("Moved Show");
    expect(html).toContain("See More");
  });
});

describe("EventsModule: a Mobile member's stop at a Guild taproom", () => {
  const host = { name: "Mars Brewing Co.", slug: "mars" };
  it("venue as the title: 'Guild taproom →' links to the taproom", () => {
    const html = render([ev({ host })], "mobile");
    expect(html).toContain("Mars Brewing Co.");
    expect(html).toMatch(/<a href="\/members\/mars"[^>]*>Guild taproom →<\/a>/);
  });
  it("with its own title: 'at Mars Brewing Co. →'", () => {
    const html = render([ev({ title: "Karaoke Night", host })], "mobile");
    expect(html).toContain("Karaoke Night");
    expect(html).toMatch(/<a href="\/members\/mars"[^>]*>at Mars Brewing Co\. →<\/a>/);
  });
});
