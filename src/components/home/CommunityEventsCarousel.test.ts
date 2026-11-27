import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommunityEventsCarousel } from "./CommunityEventsCarousel";
import type { CommunityEvent } from "@/lib/home/sections";

const event = (id: string): CommunityEvent => ({
  id,
  imageUrl: `https://example.com/${id}.jpg`,
  alt: `Poster ${id}`,
  width: 1200,
  height: 600,
  link: null,
});
const render = (events: CommunityEvent[]) =>
  renderToStaticMarkup(createElement(CommunityEventsCarousel, { events, dwellSeconds: 6 }));

describe("CommunityEventsCarousel", () => {
  it("one event: just the graphic, no arrows, dots or pause", () => {
    const html = render([event("a")]);
    expect(html).toContain('alt="Poster a"');
    expect(html).not.toContain("Previous event");
    expect(html).not.toContain("Next event");
    expect(html).not.toContain("Pause");
    expect(html).not.toContain("Show event 1");
  });
  it("several: arrows on both sides, pause, and a dot per event", () => {
    const html = render([event("a"), event("b"), event("c")]);
    expect(html).toContain('aria-label="Previous event"');
    expect(html).toContain('aria-label="Next event"');
    expect(html).toContain('aria-label="Pause"');
    expect(html.match(/aria-label="Show event \d"/g)).toHaveLength(3);
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toContain('aria-label="Community events"');
  });
  it("every graphic is on the page (so it sizes to the tallest), only the first shown", () => {
    const html = render([event("a"), event("b")]);
    expect(html).toContain('alt="Poster a"');
    expect(html).toContain('alt="Poster b"');
    const slides = [...html.matchAll(/<div[^>]*data-slide="(\d)"[^>]*>/g)].map((m) => m[0]);
    expect(slides).toHaveLength(2);
    expect(slides[0]).not.toContain("inert");
    expect(slides[1]).toContain("inert");
    expect(slides[1]).toContain('aria-hidden="true"');
  });
  it("the first dot is the current one", () => {
    const html = render([event("a"), event("b")]);
    const dots = [...html.matchAll(/<button[^>]*aria-label="Show event \d"[^>]*>/g)].map((m) => m[0]);
    expect(dots[0]).toContain('aria-current="true"');
    expect(dots[1]).not.toContain("aria-current");
  });
});
