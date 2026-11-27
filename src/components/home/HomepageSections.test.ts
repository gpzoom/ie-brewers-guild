import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomepageSections } from "./HomepageSections";
import type { CommunityEvent, VisibleSection } from "@/lib/home/sections";

const event = (o: Partial<CommunityEvent> = {}): CommunityEvent => ({
  id: "i1",
  imageUrl: "https://example.com/a.jpg",
  alt: "Beer fest poster",
  width: 1200,
  height: 600,
  link: { href: "https://example.com/fest", external: true },
  ...o,
});
const community = (...events: CommunityEvent[]): VisibleSection => ({ kind: "community", events: events.length ? events : [event()] });

const render = (sections: VisibleSection[]) =>
  renderToStaticMarkup(
    createElement(HomepageSections, {
      sections,
      dwellSeconds: 6,
      carousel: createElement("div", { "data-testid": "carousel" }, "CAROUSEL"),
    }),
  );

describe("HomepageSections", () => {
  it("renders sections in the order given", () => {
    const html = render([community(), { kind: "events" }, { kind: "spotlight" }]);
    const img = html.indexOf("Beer fest poster");
    const events = html.indexOf("CAROUSEL");
    expect(img).toBeGreaterThan(-1);
    expect(events).toBeGreaterThan(img);
  });
  it("an external event link opens in a new tab safely", () => {
    const html = render([community()]);
    expect(html).toContain('href="https://example.com/fest"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
  it("an event with no link has no anchor", () => {
    const html = render([community(event({ link: null }))]);
    expect(html).not.toContain("<a");
    expect(html).toContain('alt="Beer fest poster"');
    expect(html).toContain('width="1200"');
  });
  it("id=coming-up appears once, on the member events section, wherever it sits", () => {
    for (const sections of [
      [community(), { kind: "events" }],
      [{ kind: "events" }, community()],
    ] as VisibleSection[][]) {
      const html = render(sections);
      expect(html.split('id="coming-up"').length - 1).toBe(1);
      const at = html.indexOf('id="coming-up"');
      expect(html.slice(at, at + 400)).toContain("CAROUSEL");
    }
  });
});

describe("HomepageSections: spacing matches the old homepage", () => {
  it("default [spotlight, events]: spotlight pt-only, events py", () => {
    const html = render([{ kind: "spotlight" }, { kind: "events" }]);
    expect(html).toContain('<section class="mx-auto max-w-7xl px-4 pt-16 md:px-6 md:pt-20">');
    expect(html).toContain('<section id="coming-up" class="mx-auto max-w-7xl scroll-mt-24 px-4 pt-16 md:px-6 md:pt-20 pb-16 md:pb-20">');
  });
  it("the community carousel last keeps the bottom padding", () => {
    expect(render([{ kind: "events" }, community()])).toContain("md:pt-20 pb-16 md:pb-20");
  });
});
