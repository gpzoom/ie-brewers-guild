import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CalendarPage } from "./MemberEventsCarousel";
import type { HomeEventCard } from "@/lib/home/member-events";

const card = (o: Partial<HomeEventCard>): HomeEventCard => ({
  id: "e1",
  member: {
    id: "mars", slug: "mars", businessName: "Mars Brewing Co.", themeHex: "#B45309", timezone: "America/Los_Angeles",
    logoUrl: null, logoTileHex: "#FFFFFF", coverAssetId: null,
  },
  title: "Sample Taco Truck", description: null, startsAt: "2026-10-09T01:00:00Z", endsAt: "2026-10-09T04:00:00Z",
  allDay: false, rescheduled: false, venue: null, city: "Rancho Cucamonga", ...o,
});

describe("CalendarPage: a Guild member at the taproom (GV4)", () => {
  it("the taproom's card names the guest: 'with a Guild member', the marks, 'At the taproom'", () => {
    const html = renderToStaticMarkup(createElement(CalendarPage, { card: card({ guest: { name: "Sample Taco Truck", tag: "FOOD TRUCK" } }) }));
    expect(html).toContain("with a Guild member");
    expect(html).toContain("GUILD MEMBER");
    expect(html).toContain("FOOD TRUCK");
    expect(html).toContain("At the taproom · Rancho Cucamonga");
    expect(html).toContain("Mars Brewing Co.");
  });
  it("the taproom's own event: no Guild member line", () => {
    const html = renderToStaticMarkup(createElement(CalendarPage, { card: card({ title: "Trivia" }) }));
    expect(html).not.toContain("with a Guild member");
  });
});
