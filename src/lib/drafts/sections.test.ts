import { describe, expect, it } from "vitest";
import {
  DRAFT_SECTIONS,
  canEditSection,
  computeTopBarState,
  normalizeDraftData,
  normalizeSections,
  publishNeedsHoursCheck,
  publishableDirtySections,
  resolveViewerRole,
  sectionsToPublish,
  shouldShowPhotoChangesFrom,
} from "./sections";

describe("resolveViewerRole", () => {
  it("keeps a linked owner or full editor's role", () => {
    expect(resolveViewerRole("owner", false)).toBe("owner");
    expect(resolveViewerRole("editor", true)).toBe("editor");
  });
  it("treats an unlinked Guild admin (impersonating) as full rights", () => {
    expect(resolveViewerRole(null, true)).toBe("guild_admin");
  });
  it("gives a Guild admin full rights even if linked as media_events", () => {
    expect(resolveViewerRole("media_events", true)).toBe("guild_admin");
  });
  it("keeps media_events for a plain Photos & events editor", () => {
    expect(resolveViewerRole("media_events", false)).toBe("media_events");
  });
  it("is null for someone not linked and not a Guild admin", () => {
    expect(resolveViewerRole(null, false)).toBeNull();
    expect(resolveViewerRole("admin", false)).toBeNull();
  });
});

describe("canEditSection (mirrors can_edit_section)", () => {
  it("full editors edit every section", () => {
    for (const role of ["owner", "editor", "guild_admin"] as const) {
      for (const section of DRAFT_SECTIONS) expect(canEditSection(role, section)).toBe(true);
    }
  });
  it("media_events edits only media", () => {
    expect(DRAFT_SECTIONS.filter((s) => canEditSection("media_events", s))).toEqual(["media"]);
  });
  it("nobody else edits anything", () => {
    expect(DRAFT_SECTIONS.some((s) => canEditSection(null, s))).toBe(false);
  });
});

describe("publishableDirtySections", () => {
  it("filters to what the viewer can publish, in canonical order", () => {
    expect(publishableDirtySections(["theme", "media", "basics"], "owner")).toEqual([
      "basics",
      "media",
      "theme",
    ]);
    expect(publishableDirtySections(["theme", "media", "basics"], "media_events")).toEqual([
      "media",
    ]);
    expect(publishableDirtySections(["basics"], "media_events")).toEqual([]);
  });
});

describe("sectionsToPublish", () => {
  it("publishes only dirty publishable sections once live", () => {
    expect(sectionsToPublish({ role: "editor", status: "published", dirty: ["links"] })).toEqual([
      "links",
    ]);
  });
  it("publishes every section for a never-published member (Decision 10)", () => {
    expect(sectionsToPublish({ role: "owner", status: "draft", dirty: [] })).toEqual([
      ...DRAFT_SECTIONS,
    ]);
  });
  it("never lets a Photos & events editor make a draft member live", () => {
    expect(sectionsToPublish({ role: "media_events", status: "draft", dirty: ["media"] })).toEqual(
      [],
    );
  });
});

describe("publishNeedsHoursCheck", () => {
  it("only when basics goes live", () => {
    expect(publishNeedsHoursCheck(["basics", "theme"])).toBe(true);
    expect(publishNeedsHoursCheck(["media"])).toBe(false);
  });
});

describe("computeTopBarState", () => {
  it("published with publishable changes: label, discard, publish, unpublish", () => {
    expect(computeTopBarState({ role: "owner", status: "published", dirty: ["theme"] })).toEqual({
      showUnpublished: true,
      showDiscard: true,
      canPublish: true,
      canUnpublish: true,
      publishSections: ["theme"],
      discardSections: ["theme"],
    });
  });
  it("published with nothing dirty: no label, no discard, nothing to publish", () => {
    const state = computeTopBarState({ role: "owner", status: "published", dirty: [] });
    expect(state.showUnpublished).toBe(false);
    expect(state.showDiscard).toBe(false);
    expect(state.canPublish).toBe(false);
    expect(state.canUnpublish).toBe(true);
  });
  it("never published: discard hidden, publish offered with every section", () => {
    const state = computeTopBarState({ role: "editor", status: "draft", dirty: ["basics"] });
    expect(state.showUnpublished).toBe(true);
    expect(state.showDiscard).toBe(false);
    expect(state.canPublish).toBe(true);
    expect(state.publishSections).toEqual([...DRAFT_SECTIONS]);
    expect(state.canUnpublish).toBe(false);
  });
  it("a Photos & events editor only sees their own photo changes", () => {
    const state = computeTopBarState({
      role: "media_events",
      status: "published",
      dirty: ["basics", "media"],
    });
    expect(state.publishSections).toEqual(["media"]);
    expect(state.discardSections).toEqual(["media"]);
    expect(state.canUnpublish).toBe(false);
  });
  it("a Photos & events editor with only someone else's basics changes sees nothing unpublished", () => {
    const state = computeTopBarState({
      role: "media_events",
      status: "published",
      dirty: ["basics"],
    });
    expect(state.showUnpublished).toBe(false);
    expect(state.canPublish).toBe(false);
  });
  it("applied/suspended members can't be published from here", () => {
    expect(computeTopBarState({ role: "owner", status: "suspended", dirty: [] }).canPublish).toBe(
      false,
    );
  });
});

describe("shouldShowPhotoChangesFrom", () => {
  const base = {
    role: "owner" as const,
    dirty: ["media"],
    mediaUpdatedByUserId: "u2",
    viewerUserId: "u1",
  };
  it("shows for the owner when someone else changed photos", () => {
    expect(shouldShowPhotoChangesFrom(base)).toBe(true);
  });
  it("not when the viewer made the change", () => {
    expect(shouldShowPhotoChangesFrom({ ...base, mediaUpdatedByUserId: "u1" })).toBe(false);
  });
  it("not when media isn't dirty", () => {
    expect(shouldShowPhotoChangesFrom({ ...base, dirty: ["basics"] })).toBe(false);
  });
  it("not for the Photos & events editor", () => {
    expect(shouldShowPhotoChangesFrom({ ...base, role: "media_events" })).toBe(false);
  });
});

describe("normalizeDraftData", () => {
  it("fills a sparse draft with empty values", () => {
    const data = normalizeDraftData({
      basics: { business_name: "Brew" },
      theme: { theme: "teal" },
    });
    expect(data.basics.business_name).toBe("Brew");
    expect(data.basics.hours).toEqual([]);
    expect(data.basics.logo_background).toBe("light");
    expect(data.media.slides).toEqual([]);
    expect(data.links.links).toEqual([]);
    expect(data.discount).toEqual({
      discount_percent: null,
      discount_no_fixed_percent: false,
      discount_redeem_text: null,
      category_ids: [],
    });
    expect(data.theme.theme).toBe("teal");
  });

  it("keeps stored values, sorts slides and drops malformed ones", () => {
    const data = normalizeDraftData({
      basics: {
        hours: [
          {
            weekday: 1,
            opens_at: "09:00:00",
            closes_at: "17:00:00",
            closes_next_day: false,
            is_closed: false,
          },
        ],
        cover_crop: { x: 0, y: 0.1, w: 1, h: 0.4 },
        logo_background: "dark",
      },
      media: {
        slides: [
          { asset_id: "b", crop: { x: 0, y: 0, w: 1, h: 1 }, outbound_url: null, sort_order: 2 },
          {
            asset_id: "a",
            crop: { x: 0, y: 0, w: 1, h: 1 },
            outbound_url: "https://x.test",
            sort_order: 0,
          },
          { asset_id: "c", sort_order: 1 },
        ],
      },
    });
    expect(data.basics.hours[0].opens_at).toBe("09:00:00");
    expect(data.basics.cover_crop).toEqual({ x: 0, y: 0.1, w: 1, h: 0.4 });
    expect(data.basics.logo_background).toBe("dark");
    expect(data.media.slides.map((s) => s.asset_id)).toEqual(["a", "b"]);
  });

  it("reads the ZIP and the map pin, both halves or neither", () => {
    const full = normalizeDraftData({
      basics: { postal_code: "92374", latitude: 34.066, longitude: -117.2 },
    });
    expect(full.basics).toMatchObject({
      postal_code: "92374",
      latitude: 34.066,
      longitude: -117.2,
    });
    // numeric columns can come back as strings
    expect(
      normalizeDraftData({ basics: { latitude: "34.5", longitude: "-117.25" } }).basics,
    ).toMatchObject({ latitude: 34.5, longitude: -117.25 });
    expect(normalizeDraftData({ basics: { latitude: 34 } }).basics).toMatchObject({
      latitude: null,
      longitude: null,
    });
    expect(normalizeDraftData({ basics: {} }).basics).toMatchObject({
      postal_code: null,
      latitude: null,
      longitude: null,
    });
  });

  it("copes with garbage", () => {
    expect(() => normalizeDraftData(null)).not.toThrow();
    expect(normalizeDraftData("nope").basics.business_name).toBe("");
  });
});

describe("normalizeSections", () => {
  it("keeps known sections in canonical order", () => {
    expect(normalizeSections(["theme", "bogus", "basics"])).toEqual(["basics", "theme"]);
    expect(normalizeSections(null)).toEqual([]);
  });
});
