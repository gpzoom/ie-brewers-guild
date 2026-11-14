import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GalleryImage, SettingsSection } from "@/lib/guild/homepage-sections";

vi.mock("@/lib/guild/homepage-sections.server", () => ({ saveAnnouncement: vi.fn() }));

const { AnnouncementForm, formProblem } = await import("./AnnouncementForm");

const pic: GalleryImage = { id: "g1", imagePath: "announcements/a.png", imageUrl: "https://x/a.png", alt: "Flyer", width: 1, height: 1, usedBy: [] };

describe("formProblem", () => {
  it("asks for an image when none is chosen", () => {
    expect(formProblem({ imageId: null, gallery: [pic], linkKind: "none", linkTarget: null })).toBe("Choose an image.");
  });
  it("says so plainly when the chosen image was deleted from the gallery", () => {
    expect(formProblem({ imageId: "gone", gallery: [pic], linkKind: "none", linkTarget: null })).toBe(
      "That image was deleted from the gallery. Choose another image.",
    );
  });
  it("checks the web address with the site's own message", () => {
    expect(formProblem({ imageId: "g1", gallery: [pic], linkKind: "external", linkTarget: "example.com" })).toBe(
      "Web addresses must start with https:// or http://.",
    );
  });
  it("a complete form has no problem", () => {
    expect(formProblem({ imageId: "g1", gallery: [pic], linkKind: "external", linkTarget: "https://example.com" })).toBeNull();
    expect(formProblem({ imageId: "g1", gallery: [pic], linkKind: "internal", linkTarget: "/about" })).toBeNull();
  });
});

describe("AnnouncementForm web address field", () => {
  it("is a plain text field, so the browser's own popup never replaces our message", () => {
    const editing = { id: "a1", kind: "image", position: 1, enabled: true, image_id: "g1", alt_text: null, link_kind: "external", link_target: "https://example.com", starts_on: null, ends_on: null, image: null, status: "showing", imageUrl: null } as SettingsSection;
    const html = renderToStaticMarkup(
      createElement(AnnouncementForm, { editing, gallery: [pic], memberPages: [], onGalleryChanged: async () => {}, onSaved: async () => {}, onCancel: () => {} }),
    );
    expect(html).toContain('aria-label="Web address"');
    expect(html).not.toContain('type="url"');
    expect(html).toContain('inputMode="url"');
  });
});
