import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomepageSections } from "./HomepageSections";
import type { VisibleSection } from "@/lib/home/sections";

const image = (o: Partial<Extract<VisibleSection, { kind: "image" }>> = {}): VisibleSection => ({
  kind: "image",
  id: "i1",
  imageUrl: "https://example.com/a.jpg",
  alt: "Beer fest poster",
  width: 1200,
  height: 600,
  link: { href: "https://example.com/fest", external: true },
  ...o,
});

const render = (sections: VisibleSection[]) =>
  renderToStaticMarkup(
    createElement(HomepageSections, {
      sections,
      carousel: createElement("div", { "data-testid": "carousel" }, "CAROUSEL"),
    }),
  );

describe("HomepageSections", () => {
  it("renders sections in the order given", () => {
    const html = render([image(), { kind: "events" }, { kind: "spotlight" }]);
    const img = html.indexOf("Beer fest poster");
    const events = html.indexOf("CAROUSEL");
    expect(img).toBeGreaterThan(-1);
    expect(events).toBeGreaterThan(img);
  });
  it("an external image link opens in a new tab safely", () => {
    const html = render([image()]);
    expect(html).toContain('href="https://example.com/fest"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
  it("an image with no link has no anchor", () => {
    const html = render([image({ link: null })]);
    expect(html).not.toContain("<a");
    expect(html).toContain('alt="Beer fest poster"');
    expect(html).toContain('width="1200"');
  });
  it("id=coming-up appears once, on the events section, wherever it sits", () => {
    for (const sections of [
      [image(), { kind: "events" }, image({ id: "i2" })],
      [{ kind: "events" }, image()],
      [image(), { kind: "events" }],
    ] as VisibleSection[][]) {
      const html = render(sections);
      expect(html.split('id="coming-up"').length - 1).toBe(1);
      const at = html.indexOf('id="coming-up"');
      expect(html.slice(at, at + 400)).toContain("CAROUSEL");
    }
  });
});
