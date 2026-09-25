import { describe, expect, it } from "vitest";
import { normalizeDraftData, type MemberDraftData } from "@/lib/drafts/sections";
import {
  emptySections,
  sectionCompleteness,
  type CompletenessMember,
} from "./section-completeness";

function draft(
  overrides: {
    basics?: Partial<MemberDraftData["basics"]>;
    media?: Partial<MemberDraftData["media"]>;
    links?: Partial<MemberDraftData["links"]>;
    discount?: Partial<MemberDraftData["discount"]>;
  } = {},
): MemberDraftData {
  const empty = normalizeDraftData({});
  return {
    basics: { ...empty.basics, business_name: "Hop House", city: "Riverside", ...overrides.basics },
    media: { ...empty.media, ...overrides.media },
    links: { ...empty.links, ...overrides.links },
    discount: { ...empty.discount, ...overrides.discount },
    theme: empty.theme,
  };
}

const producer: CompletenessMember = {
  memberType: "producer",
  typeConfirmed: true,
  eventCount: 0,
  hasCalendarConnection: false,
};

function doneMap(list: ReturnType<typeof sectionCompleteness>) {
  return Object.fromEntries(list.map((s) => [s.step, s.done]));
}

describe("sectionCompleteness", () => {
  it("lists the type's own steps, in order, without Welcome", () => {
    expect(sectionCompleteness(draft(), producer).map((s) => s.step)).toEqual([
      "type",
      "basics",
      "logo-cover",
      "hours",
      "events",
      "photos",
      "links",
      "theme",
    ]);
    expect(
      sectionCompleteness(draft(), { ...producer, memberType: "mobile" }).map((s) => s.step),
    ).not.toContain("events");
    expect(
      sectionCompleteness(draft(), { ...producer, memberType: "allied" }).map((s) => s.step),
    ).toContain("discount");
  });

  it("marks a freshly set-up profile's optional steps empty (theme always counts)", () => {
    expect(doneMap(sectionCompleteness(draft(), producer))).toEqual({
      type: true,
      basics: true,
      "logo-cover": false,
      hours: false,
      events: false,
      photos: false,
      links: false,
      theme: true,
    });
  });

  it("needs name and city for basics, and a confirmed type", () => {
    const map = doneMap(
      sectionCompleteness(draft({ basics: { city: "  " } }), { ...producer, typeConfirmed: false }),
    );
    expect(map.basics).toBe(false);
    expect(map.type).toBe(false);
  });

  it("counts a logo or a cover", () => {
    expect(
      doneMap(sectionCompleteness(draft({ basics: { logo_asset_id: "a" } }), producer))[
        "logo-cover"
      ],
    ).toBe(true);
    expect(
      doneMap(sectionCompleteness(draft({ basics: { cover_asset_id: "c" } }), producer))[
        "logo-cover"
      ],
    ).toBe(true);
  });

  it("counts any weekly hours row for a producer", () => {
    const hours = [
      { weekday: 1, opens_at: null, closes_at: null, closes_next_day: false, is_closed: true },
    ];
    expect(doneMap(sectionCompleteness(draft({ basics: { hours } }), producer)).hours).toBe(true);
  });

  it("uses events or a calendar for a mobile member's 'Where we'll be', not hours", () => {
    const hours = [
      {
        weekday: 1,
        opens_at: "09:00",
        closes_at: "17:00",
        closes_next_day: false,
        is_closed: false,
      },
    ];
    const mobile = { ...producer, memberType: "mobile" as const };
    expect(doneMap(sectionCompleteness(draft({ basics: { hours } }), mobile)).hours).toBe(false);
    expect(doneMap(sectionCompleteness(draft(), { ...mobile, eventCount: 2 })).hours).toBe(true);
    expect(
      doneMap(sectionCompleteness(draft(), { ...mobile, hasCalendarConnection: true })).hours,
    ).toBe(true);
  });

  it("counts events or a calendar for the events step", () => {
    expect(doneMap(sectionCompleteness(draft(), { ...producer, eventCount: 1 })).events).toBe(true);
    expect(
      doneMap(sectionCompleteness(draft(), { ...producer, hasCalendarConnection: true })).events,
    ).toBe(true);
  });

  it("counts slides and links with an address", () => {
    const slides = [
      { asset_id: "a", crop: { x: 0, y: 0, w: 1, h: 1 }, outbound_url: null, sort_order: 0 },
    ];
    expect(doneMap(sectionCompleteness(draft({ media: { slides } }), producer)).photos).toBe(true);
    const blank = [{ kind: "website" as const, label: null, url: " ", sort_order: 0 }];
    expect(doneMap(sectionCompleteness(draft({ links: { links: blank } }), producer)).links).toBe(
      false,
    );
    const real = [
      { kind: "website" as const, label: null, url: "https://example.com", sort_order: 0 },
    ];
    expect(doneMap(sectionCompleteness(draft({ links: { links: real } }), producer)).links).toBe(
      true,
    );
  });

  it("counts any discount field or a supply category for an Allied Member", () => {
    const allied = { ...producer, memberType: "allied" as const };
    expect(doneMap(sectionCompleteness(draft(), allied)).discount).toBe(false);
    expect(
      doneMap(sectionCompleteness(draft({ discount: { discount_percent: 10 } }), allied)).discount,
    ).toBe(true);
    expect(
      doneMap(sectionCompleteness(draft({ discount: { discount_no_fixed_percent: true } }), allied))
        .discount,
    ).toBe(true);
    expect(
      doneMap(sectionCompleteness(draft({ discount: { category_ids: ["c1"] } }), allied)).discount,
    ).toBe(true);
  });

  it("labels step 5 for a mobile member", () => {
    const mobile = { ...producer, memberType: "mobile" as const };
    expect(sectionCompleteness(draft(), mobile).find((s) => s.step === "hours")?.label).toBe(
      "Where we'll be",
    );
  });
});

describe("emptySections", () => {
  it("returns only what's still empty", () => {
    expect(emptySections(draft(), producer).map((s) => s.step)).toEqual([
      "logo-cover",
      "hours",
      "events",
      "photos",
      "links",
    ]);
  });
});
