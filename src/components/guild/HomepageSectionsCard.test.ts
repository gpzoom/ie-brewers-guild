import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomepageSectionsCard } from "./HomepageSectionsCard";
import type { SettingsSection } from "@/lib/guild/homepage-sections";

const row = (o: Partial<SettingsSection>): SettingsSection => ({
  id: "s",
  kind: "image",
  position: 1,
  enabled: true,
  image_id: null,
  alt_text: null,
  link_kind: "none",
  link_target: null,
  starts_on: null,
  ends_on: null,
  image: null,
  status: "showing",
  imageUrl: null,
  ...o,
});

const image = { image_path: "announcements/a.jpg", alt_text: "Holiday party flyer", width: 800, height: 600 };

const sections: SettingsSection[] = [
  row({ id: "ev", kind: "events", position: 1 }),
  row({ id: "sp", kind: "spotlight", position: 2, enabled: false, status: "off" }),
  row({ id: "a1", position: 3, image_id: "g1", image, imageUrl: "https://x/a.jpg", ends_on: "2026-12-20" }),
  row({ id: "a2", position: 4, image_id: "g1", image, alt_text: "Winter market", starts_on: "2026-12-01", status: "scheduled", imageUrl: "https://x/a.jpg" }),
];

const html = renderToStaticMarkup(
  createElement(HomepageSectionsCard, { initial: { sections, gallery: [], memberPages: [] } }),
);

describe("HomepageSectionsCard", () => {
  it("lists rows in position order with their status labels", () => {
    const order = ["Events carousel", "spotlight", "Holiday party flyer", "Winter market"].map((t) => html.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("Showing · until Dec 20");
    expect(html).toContain("Scheduled · from Dec 1");
    expect(html).toContain("Off");
  });

  it("disables the first row's up arrow and the last row's down arrow", () => {
    const ups = [...html.matchAll(/<button[^>]*aria-label="Move [^"]* up"[^>]*>/g)].map((m) => m[0]);
    const downs = [...html.matchAll(/<button[^>]*aria-label="Move [^"]* down"[^>]*>/g)].map((m) => m[0]);
    expect(ups).toHaveLength(4);
    expect(downs).toHaveLength(4);
    expect(ups[0]).toMatch(/ disabled(=|>| )/);
    expect(ups[1]).not.toMatch(/ disabled(=|>| )/);
    expect(downs[3]).toMatch(/ disabled(=|>| )/);
    expect(downs[2]).not.toMatch(/ disabled(=|>| )/);
  });

  it("only announcements have Delete", () => {
    expect(html.match(/aria-label="Delete [^"]*"/g)).toHaveLength(2);
    expect(html).not.toContain('aria-label="Delete Events carousel"');
  });
});

describe("AnnouncementForm", () => {
  it("keeps the gallery's inputs outside the announcement form", async () => {
    const { AnnouncementForm } = await import("./AnnouncementForm");
    const markup = renderToStaticMarkup(
      createElement(AnnouncementForm, {
        editing: null,
        gallery: [],
        memberPages: [],
        onGalleryChanged: async () => {},
        onSaved: async () => {},
        onCancel: () => {},
      }),
    );
    const form = markup.slice(markup.indexOf("<form"), markup.indexOf("</form>"));
    expect(markup).toContain("Describe the new image");
    expect(form).not.toContain("Describe the new image");
    expect(form).toContain("Description (optional)");
  });
});
