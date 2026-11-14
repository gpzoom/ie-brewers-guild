import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SECTIONS,
  INTERNAL_PAGES,
  checkLink,
  hasEventsSection,
  isInDateWindow,
  pacificToday,
  resolveLink,
  sectionStatus,
  visibleSections,
  type SectionRow,
} from "@/lib/home/sections";

function row(over: Partial<SectionRow>): SectionRow {
  return {
    id: "r1",
    kind: "image",
    position: 1,
    enabled: true,
    image_id: "i1",
    alt_text: null,
    link_kind: "none",
    link_target: null,
    starts_on: null,
    ends_on: null,
    image: { image_path: "announcements/a.jpg", alt_text: "Image alt", width: 800, height: 600 },
    ...over,
  };
}

const ctx = {
  today: "2026-12-10",
  hasSpotlight: true,
  publishedSlugs: new Set(["mars"]),
  imageUrl: (p: string) => `https://cdn.test/${p}`,
};

describe("pacificToday", () => {
  it("uses the Pacific calendar day", () => {
    expect(pacificToday(new Date("2026-12-21T07:59:00Z"))).toBe("2026-12-20");
    expect(pacificToday(new Date("2026-12-21T08:00:00Z"))).toBe("2026-12-21");
  });
});

describe("isInDateWindow", () => {
  const w = { starts_on: "2026-12-01", ends_on: "2026-12-20" };
  it("includes both end days", () => {
    expect(isInDateWindow(w, "2026-12-01")).toBe(true);
    expect(isInDateWindow(w, "2026-12-20")).toBe(true);
  });
  it("excludes days outside", () => {
    expect(isInDateWindow(w, "2026-12-21")).toBe(false);
    expect(isInDateWindow(w, "2026-11-30")).toBe(false);
  });
  it("is open-ended when dates are null", () => {
    expect(isInDateWindow({ starts_on: null, ends_on: null }, "2030-01-01")).toBe(true);
  });
});

describe("sectionStatus", () => {
  it("reports scheduled, ended, showing and off", () => {
    expect(sectionStatus(row({ starts_on: "2026-12-15" }), "2026-12-10")).toBe("scheduled");
    expect(sectionStatus(row({ ends_on: "2026-12-05" }), "2026-12-10")).toBe("ended");
    expect(sectionStatus(row({}), "2026-12-10")).toBe("showing");
    expect(sectionStatus(row({ enabled: false, ends_on: "2026-12-05" }), "2026-12-10")).toBe("off");
  });
});

describe("checkLink", () => {
  it("validates external links", () => {
    expect(checkLink("external", "javascript:alert(1)")).toBeTruthy();
    expect(checkLink("external", "https://example.com/x")).toBeNull();
    expect(checkLink("external", null)).toBeTruthy();
  });
  it("validates internal links", () => {
    expect(checkLink("internal", "/members/mars-brewing-co")).toBeNull();
    expect(checkLink("internal", "/guild/settings")).toBeTruthy();
    expect(checkLink("internal", "/members")).toBeNull();
  });
  it("accepts none", () => {
    expect(checkLink("none", null)).toBeNull();
  });
});

describe("resolveLink", () => {
  const slugs = new Set(["mars"]);
  it("drops member links to unpublished members", () => {
    expect(resolveLink("internal", "/members/gone", slugs)).toBeNull();
    expect(resolveLink("internal", "/members/mars", slugs)).toEqual({
      href: "/members/mars",
      external: false,
    });
  });
  it("marks external links", () => {
    expect(resolveLink("external", "https://example.com", slugs)).toEqual({
      href: "https://example.com",
      external: true,
    });
  });
  it("returns null for none or invalid", () => {
    expect(resolveLink("none", null, slugs)).toBeNull();
    expect(resolveLink("external", "javascript:alert(1)", slugs)).toBeNull();
  });
});

describe("visibleSections", () => {
  it("orders by position and skips disabled rows", () => {
    const rows = [
      row({ id: "b", kind: "events", position: 3, image_id: null, image: null }),
      row({ id: "a", position: 1 }),
      row({ id: "c", position: 2, enabled: false }),
    ];
    const out = visibleSections(rows, ctx);
    expect(out.map((s) => s.kind)).toEqual(["image", "events"]);
  });
  it("skips spotlight without content", () => {
    const rows = [row({ kind: "spotlight", image_id: null, image: null })];
    expect(visibleSections(rows, { ...ctx, hasSpotlight: false })).toEqual([]);
    expect(visibleSections(rows, ctx)).toEqual([{ kind: "spotlight" }]);
  });
  it("skips image rows with no image or out of window", () => {
    expect(visibleSections([row({ image: null })], ctx)).toEqual([]);
    expect(visibleSections([row({ ends_on: "2026-12-01" })], ctx)).toEqual([]);
  });
  it("logs an image row skipped for a missing image, but not one that is off or out of dates", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    visibleSections([row({ id: "bad1", image: null })], ctx);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("bad1");
    spy.mockClear();
    visibleSections([row({ enabled: false, image: null }), row({ ends_on: "2026-12-01" })], ctx);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("alt override wins and link resolves", () => {
    const [s] = visibleSections(
      [row({ alt_text: "Override", link_kind: "internal", link_target: "/members/mars" })],
      ctx,
    );
    expect(s).toEqual({
      kind: "image",
      id: "r1",
      imageUrl: "https://cdn.test/announcements/a.jpg",
      alt: "Override",
      width: 800,
      height: 600,
      link: { href: "/members/mars", external: false },
    });
  });
});

describe("DEFAULT_SECTIONS", () => {
  it("puts spotlight first when present", () => {
    expect(DEFAULT_SECTIONS(true)).toEqual([{ kind: "spotlight" }, { kind: "events" }]);
    expect(DEFAULT_SECTIONS(false)).toEqual([{ kind: "events" }]);
  });
});

describe("hasEventsSection", () => {
  it("is true only when an events block is listed", () => {
    expect(hasEventsSection([{ kind: "spotlight" }, { kind: "events" }])).toBe(true);
    expect(hasEventsSection([{ kind: "spotlight" }])).toBe(false);
    expect(hasEventsSection([])).toBe(false);
  });
});

describe("INTERNAL_PAGES", () => {
  it("does not offer the homepage or the events redirect", () => {
    const paths = INTERNAL_PAGES.map((p) => p.path);
    expect(paths).not.toContain("/");
    expect(paths).not.toContain("/events");
  });
});
