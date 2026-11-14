import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CalendarPage } from "./MemberEventsCarousel";
import { carouselFrame, showsAlternate, type HomeEventCard } from "@/lib/home/member-events";

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
  it("the taproom's card names the guest by name (owner, 2026-11-14), the marks, 'At the taproom'", () => {
    const html = renderToStaticMarkup(createElement(CalendarPage, { card: card({ title: "Taco Tuesday", guest: { name: "Sample Taco Truck", tag: "FOOD TRUCK" } }) }));
    expect(html).toContain("with Sample Taco Truck");
    expect(html).toContain("GUILD MEMBER");
    expect(html).toContain("FOOD TRUCK");
    expect(html).toContain("At the taproom · Rancho Cucamonga");
    expect(html).toContain("Mars Brewing Co.");
  });
  it("the taproom's own event: no Guild member line", () => {
    const html = renderToStaticMarkup(createElement(CalendarPage, { card: card({ title: "Trivia" }) }));
    expect(html).not.toContain("GUILD MEMBER");
  });
  it("ignores an alternate: the carousel picks which version to show", () => {
    const truck = { ...card({}).member, id: "truck", slug: "truck", businessName: "Sample Taco Truck" };
    const html = renderToStaticMarkup(
      createElement(CalendarPage, { card: card({ title: "Tuesday Trivia", alternate: card({ id: "e2", member: truck, title: "Trivia Night" }) }) }),
    );
    expect(html).toContain("Mars Brewing Co.");
    expect(html).not.toContain("Trivia Night");
  });
});

describe("showsAlternate: a shared night switches every pass", () => {
  it("first pass taproom, second pass guest, third taproom", () => {
    expect([0, 2, 3, 5, 6].map((p) => showsAlternate(p, 3, 0))).toEqual([false, false, true, true, false]);
  });
  it("a random start of 1 begins on the guest", () => {
    expect(showsAlternate(0, 3, 1)).toBe(true);
    expect(showsAlternate(3, 3, 1)).toBe(false);
  });
  it("going back from the first slide moves to the previous pass", () => {
    expect(showsAlternate(-1, 3, 0)).toBe(true);
  });
  it("a single slide shows the taproom", () => {
    expect(showsAlternate(0, 1, 0)).toBe(false);
  });
});

describe("carouselFrame: what's on screen and up next at a position", () => {
  // "B" is a shared night whose other version is "b".
  const slides = ["a", "B", "c"];
  const alt = (s: string) => (s === "B" ? "b" : undefined);
  it("first pass: the taproom version, in the stage and in Up next", () => {
    expect(carouselFrame(slides, 0, 0, alt)).toEqual({ current: "a", upNext: [{ slide: "B", k: 1 }, { slide: "c", k: 2 }] });
  });
  it("Up next past the wrap shows the next pass's version", () => {
    expect(carouselFrame(slides, 2, 0, alt)).toEqual({ current: "c", upNext: [{ slide: "a", k: 1 }, { slide: "b", k: 2 }] });
  });
  it("the second pass shows the guest version on stage", () => {
    expect(carouselFrame(slides, 4, 0, alt).current).toBe("b");
  });
  it("a start of 1 flips every pass", () => {
    expect(carouselFrame(slides, 1, 1, alt).current).toBe("b");
  });
  it("one slide: no Up next", () => {
    expect(carouselFrame(["B"], 0, 0, alt)).toEqual({ current: "B", upNext: [] });
  });
});
