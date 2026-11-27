import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomepageSectionsCard, statusLabel } from "./HomepageSectionsCard";
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
  row({ id: "a1", position: 2, image_id: "g1", image, imageUrl: "https://x/a.jpg", ends_on: "2026-12-20" }),
  row({ id: "cm", kind: "community", position: 3 }),
  row({ id: "sp", kind: "spotlight", position: 4, enabled: false, status: "off" }),
  row({ id: "a2", position: 5, image_id: "g1", image, alt_text: "Winter market", starts_on: "2026-12-01", status: "scheduled", imageUrl: "https://x/a.jpg" }),
];

const html = renderToStaticMarkup(
  createElement(HomepageSectionsCard, { initial: { sections, gallery: [], memberPages: [] } }),
);

describe("HomepageSectionsCard", () => {
  it("lists the blocks in order, with the events inside the Community Events carousel", () => {
    const order = ["Member Events carousel", "Community Events carousel", "Holiday party flyer", "Winter market", "Add a community event", "spotlight"].map((t) => html.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("Showing · until Dec 20");
    expect(html).toContain("Scheduled · from Dec 1");
    expect(html).toContain("Off");
  });

  const arrow = (label: string, dir: "up" | "down") => html.match(new RegExp(`<button[^>]*aria-label="Move ${label} ${dir}"[^>]*>`))?.[0] ?? "";
  const disabled = / disabled(=|>| )/;

  it("blocks move among blocks: first can't go up, last can't go down", () => {
    expect(arrow("Member Events carousel", "up")).toMatch(disabled);
    expect(arrow("Member Events carousel", "down")).not.toMatch(disabled);
    expect(arrow("Community Events carousel", "up")).not.toMatch(disabled);
    expect(html.match(/<button[^>]*aria-label="Move [^"]*potlight down"[^>]*>/)?.[0]).toMatch(disabled);
  });

  it("events move among events: first can't go up, last can't go down", () => {
    expect(arrow("Holiday party flyer", "up")).toMatch(disabled);
    expect(arrow("Holiday party flyer", "down")).not.toMatch(disabled);
    expect(arrow("Winter market", "up")).not.toMatch(disabled);
    expect(arrow("Winter market", "down")).toMatch(disabled);
  });

  it("only community events have Edit and Delete", () => {
    expect(html.match(/aria-label="Delete [^"]*"/g)).toHaveLength(2);
    expect(html.match(/aria-label="Edit [^"]*"/g)).toHaveLength(2);
    expect(html).not.toContain('aria-label="Delete Member Events carousel"');
    expect(html).not.toContain('aria-label="Delete Community Events carousel"');
  });

  it("names the image library for community events", () => {
    expect(html).toContain("Community event images");
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
    expect(markup).toContain("Add a community event");
    expect(markup).toContain("Describe the new image");
    expect(form).not.toContain("Describe the new image");
    expect(form).toContain("Description (optional)");
  });
});

describe("HomepageSectionsCard when the list could not be read", () => {
  it("shows a plain error instead of the list", () => {
    const markup = renderToStaticMarkup(createElement(HomepageSectionsCard, { initial: null }));
    expect(markup).toContain("Homepage sections");
    expect(markup).toContain("Couldn&#x27;t load the homepage sections — reload the page to try again.");
    expect(markup).not.toContain("Add a community event");
  });
});

describe("statusLabel years", () => {
  const now = new Date("2026-11-14T20:00:00Z");
  it("omits the year within the current Pacific year", () => {
    expect(statusLabel(row({ status: "showing", ends_on: "2026-12-20" }), now)).toBe("Showing · until Dec 20");
    expect(statusLabel(row({ status: "scheduled", starts_on: "2026-12-01" }), now)).toBe("Scheduled · from Dec 1");
    expect(statusLabel(row({ status: "ended", ends_on: "2026-10-20" }), now)).toBe("Ended · Oct 20");
  });
  it("adds the year when the date is in another year", () => {
    expect(statusLabel(row({ status: "scheduled", starts_on: "2027-12-01" }), now)).toBe("Scheduled · from Dec 1, 2027");
    expect(statusLabel(row({ status: "showing", ends_on: "2027-01-05" }), now)).toBe("Showing · until Jan 5, 2027");
    expect(statusLabel(row({ status: "ended", ends_on: "2025-12-20" }), now)).toBe("Ended · Dec 20, 2025");
  });
  it("uses the Pacific year, not UTC, around New Year", () => {
    const nye = new Date("2027-01-01T03:00:00Z"); // still Dec 31, 2026 in Pacific
    expect(statusLabel(row({ status: "ended", ends_on: "2026-12-20" }), nye)).toBe("Ended · Dec 20");
  });
});

describe("AnnouncementGallery upload button", () => {
  it("is disabled until a description is typed", async () => {
    const { AnnouncementGallery } = await import("./AnnouncementGallery");
    const markup = renderToStaticMarkup(
      createElement(AnnouncementGallery, { gallery: [], onChanged: async () => {} }),
    );
    const button = markup.match(/<button[^>]*>Upload new<\/button>/)?.[0] ?? "";
    expect(button).toMatch(/ disabled(=|>| )/);
  });
});
