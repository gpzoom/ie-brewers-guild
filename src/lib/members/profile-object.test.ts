import { describe, expect, it } from "vitest";
import {
  applyDraftSections,
  buildProfileObject,
  referencedAssetIds,
  upcomingOrCanceledEvents,
  type BuildProfileInput,
  type ProfileRows,
} from "./profile-object";
import { normalizeDraftData } from "@/lib/drafts/sections";
import type { EventRow, MediaAssetRow, MemberRow } from "@/lib/supabase/types";

const MEMBER: MemberRow = {
  id: "m1",
  slug: "brew",
  member_type: "producer",
  business_name: "Live Brewing",
  tagline: "Live tagline",
  city: "Riverside",
  state: "CA",
  street_address: "1 Main St",
  postal_code: null,
  latitude: null,
  longitude: null,
  service_area: null,
  lead_time: null,
  phone: "555-0100",
  contact_email: null,
  timezone: "America/Los_Angeles",
  theme: "amber",
  logo_asset_id: "logo-live",
  logo_background: "light",
  cover_asset_id: null,
  cover_crop: null,
  og_image_asset_id: null,
  member_since_year: 2015,
  discount_percent: null,
  discount_no_fixed_percent: false,
  discount_redeem_text: null,
  status: "published",
  hours_confirmed_at: null,
  published_at: null,
  trail_eligible: false,
};

const LIVE: ProfileRows = {
  member: MEMBER,
  hours: [
    {
      id: "h1",
      member_id: "m1",
      weekday: 1,
      opens_at: "12:00:00",
      closes_at: "20:00:00",
      closes_next_day: false,
      is_closed: false,
    },
  ],
  specialHours: [],
  slides: [
    {
      id: "s1",
      member_id: "m1",
      asset_id: "photo-1",
      crop: { x: 0, y: 0, w: 1, h: 1 },
      outbound_url: null,
      sort_order: 0,
    },
  ],
  links: [
    {
      id: "l1",
      member_id: "m1",
      kind: "website",
      label: null,
      url: "https://live.test",
      sort_order: 0,
    },
  ],
  categoryIds: [],
};

const DRAFT = normalizeDraftData({
  basics: {
    business_name: "Draft Brewing",
    tagline: "Draft tagline",
    city: "Corona",
    state: "CA",
    timezone: "America/Los_Angeles",
    phone: "555-0199",
    logo_asset_id: "logo-draft",
    logo_background: "dark",
    cover_asset_id: "cover-draft",
    cover_crop: { x: 0, y: 0.2, w: 1, h: 0.4 },
    hours: [
      {
        weekday: 5,
        opens_at: "16:00",
        closes_at: "22:00",
        closes_next_day: false,
        is_closed: false,
      },
    ],
    special_hours: [
      {
        date: "2026-12-25",
        is_closed: true,
        opens_at: null,
        closes_at: null,
        closes_next_day: false,
        note: "Xmas",
      },
    ],
  },
  media: {
    slides: [
      {
        asset_id: "photo-3",
        crop: { x: 0, y: 0, w: 0.8, h: 1 },
        outbound_url: null,
        sort_order: 1,
      },
      {
        asset_id: "photo-2",
        crop: { x: 0, y: 0, w: 0.8, h: 1 },
        outbound_url: "https://shop.test",
        sort_order: 0,
      },
    ],
  },
  links: {
    links: [
      { kind: "instagram", label: null, url: "https://ig.test", sort_order: 5 },
      { kind: "website", label: "Site", url: "https://site.test", sort_order: null },
      { kind: "menu", label: null, url: "https://menu.test", sort_order: 1 },
    ],
  },
  discount: {
    discount_percent: 10,
    discount_no_fixed_percent: false,
    discount_redeem_text: "Show card",
    category_ids: ["c1"],
  },
  theme: { theme: "teal" },
});

describe("applyDraftSections", () => {
  it("lays the whole draft over live for a full editor", () => {
    const rows = applyDraftSections(LIVE, DRAFT, ["basics", "media", "links", "discount", "theme"]);
    expect(rows.member.business_name).toBe("Draft Brewing");
    expect(rows.member.logo_asset_id).toBe("logo-draft");
    expect(rows.member.logo_background).toBe("dark");
    expect(rows.member.cover_crop).toEqual({ x: 0, y: 0.2, w: 1, h: 0.4 });
    expect(rows.member.theme).toBe("teal");
    expect(rows.member.discount_percent).toBe(10);
    // Never touched by a draft:
    expect(rows.member.status).toBe("published");
    expect(rows.member.member_type).toBe("producer");
    expect(rows.member.slug).toBe("brew");
    expect(rows.hours.map((h) => h.weekday)).toEqual([5]);
    expect(rows.specialHours[0].note).toBe("Xmas");
    expect(rows.slides.map((s) => s.asset_id).sort()).toEqual(["photo-2", "photo-3"]);
    // Links ordered like publish_member_draft: by sort_order, missing last.
    expect(rows.links.map((l) => l.kind)).toEqual(["menu", "instagram", "website"]);
    expect(rows.links.map((l) => l.sort_order)).toEqual([0, 1, 2]);
    expect(rows.categoryIds).toEqual(["c1"]);
  });

  it("applies only media for a Photos & events editor's preview", () => {
    const rows = applyDraftSections(LIVE, DRAFT, ["media"]);
    expect(rows.member.business_name).toBe("Live Brewing");
    expect(rows.hours).toBe(LIVE.hours);
    expect(rows.links).toBe(LIVE.links);
    expect(rows.slides.map((s) => s.asset_id).sort()).toEqual(["photo-2", "photo-3"]);
  });

  it("doesn't mutate the live rows", () => {
    applyDraftSections(LIVE, DRAFT, ["basics", "theme"]);
    expect(LIVE.member.business_name).toBe("Live Brewing");
  });
});

describe("referencedAssetIds", () => {
  it("collects logo, cover and slide photos once each", () => {
    const rows = applyDraftSections(LIVE, DRAFT, ["basics", "media"]);
    expect(referencedAssetIds(rows).sort()).toEqual([
      "cover-draft",
      "logo-draft",
      "photo-2",
      "photo-3",
    ]);
  });
});

function event(partial: Partial<EventRow>): EventRow {
  return {
    id: "e",
    member_id: "m1",
    calendar_connection_id: null,
    source: "manual",
    external_event_id: null,
    title: "Gig",
    description: null,
    starts_at: "2026-09-01T18:00:00Z",
    ends_at: null,
    venue_name: null,
    city: null,
    address: null,
    overlay_status: null,
    overlay_starts_at: null,
    overlay_note: null,
    overlay_set_at: null,
    is_hidden: false,
    ...partial,
  };
}

describe("upcomingOrCanceledEvents", () => {
  const now = new Date("2026-09-25T12:00:00Z");
  it("keeps upcoming and in-progress events, drops past ones", () => {
    const events = [
      event({ id: "past", starts_at: "2026-09-20T18:00:00Z" }),
      event({ id: "future", starts_at: "2026-10-01T18:00:00Z" }),
      event({ id: "now", starts_at: "2026-09-25T10:00:00Z", ends_at: "2026-09-25T14:00:00Z" }),
    ];
    expect(upcomingOrCanceledEvents(events, now).map((e) => e.id)).toEqual(["future", "now"]);
  });
  it("always keeps canceled events", () => {
    expect(
      upcomingOrCanceledEvents([event({ id: "c", overlay_status: "canceled" })], now),
    ).toHaveLength(1);
  });
  it("uses the rescheduled start as the effective end", () => {
    const moved = event({
      starts_at: "2026-09-01T18:00:00Z",
      ends_at: "2026-09-01T20:00:00Z",
      overlay_starts_at: "2026-10-02T18:00:00Z",
    });
    expect(upcomingOrCanceledEvents([moved], now)).toHaveLength(1);
  });
});

function asset(id: string): MediaAssetRow {
  return {
    id,
    member_id: "m1",
    storage_path: `m1/${id}.jpg`,
    kind: "image",
    mime_type: "image/jpeg",
    byte_size: 1,
    width: 100,
    height: 100,
    original_filename: null,
    source: "member_upload",
    uploaded_by_user_id: null,
    upload_token_id: null,
    creator_name: null,
    creator_credit: false,
    permission_accepted_at: null,
    review_status: "approved",
    created_at: "2026-09-01T00:00:00Z",
  };
}

function input(overrides: Partial<BuildProfileInput> = {}): BuildProfileInput {
  return {
    rows: LIVE,
    assets: [asset("photo-1"), asset("logo-live")],
    events: [],
    categories: [],
    logoPublicUrl: "https://cdn.test/logo.png",
    directoryEntries: [
      { id: "m0", slug: "a", businessName: "A", city: "X", memberType: "producer" },
      {
        id: "m1",
        slug: "brew",
        businessName: "Live Brewing",
        city: "Riverside",
        memberType: "producer",
      },
      { id: "m2", slug: "c", businessName: "C", city: "Y", memberType: "producer" },
    ],
    sameTypeEntries: [],
    siblingEntries: [],
    crossLinkLogoUrl: null,
    crossLinkLogoBackground: null,
    siteOrigin: "https://site.test",
    now: new Date("2026-09-25T12:00:00Z"),
    flags: {
      isPreview: false,
      isImpersonatedPreview: false,
      isImpersonatingThisMember: false,
      viewerIsEditor: false,
    },
    ...overrides,
  };
}

describe("buildProfileObject", () => {
  it("assembles the template input", () => {
    const data = buildProfileObject(input());
    expect(data.member.business_name).toBe("Live Brewing");
    expect(data.carouselSlides).toHaveLength(1);
    expect(data.carouselSlides[0].asset.id).toBe("photo-1");
    expect(data.logoAsset?.id).toBe("logo-live");
    expect(data.coverAsset).toBeNull();
    expect(data.headerPrev?.id).toBe("m0");
    expect(data.headerNext?.id).toBe("m2");
    expect(data.headerPosition).toEqual({ index: 2, total: 3 });
    expect(data.now).toBe("2026-09-25T12:00:00.000Z");
    expect(data.ogImageUrl).toBe("https://site.test/og/producer.png");
  });

  it("drops a slide whose photo isn't readable instead of crashing", () => {
    const data = buildProfileObject(input({ assets: [] }));
    expect(data.carouselSlides).toEqual([]);
    expect(data.logoAsset).toBeNull();
  });

  it("uses the member's own sharing image when set", () => {
    const rows = { ...LIVE, member: { ...MEMBER, og_image_asset_id: "og-1" } };
    expect(buildProfileObject(input({ rows })).ogImageUrl).toBe(
      "https://site.test/api/member-media/og-1",
    );
  });

  it("has no header position when the member isn't in the published list", () => {
    const data = buildProfileObject(input({ directoryEntries: [] }));
    expect(data.headerPosition).toBeNull();
    expect(data.headerNext).toBeNull();
  });

  it("renders a draft the same way (slides in slot order)", () => {
    const rows = applyDraftSections(LIVE, DRAFT, ["basics", "media", "links", "discount", "theme"]);
    const data = buildProfileObject(
      input({
        rows,
        assets: [asset("photo-2"), asset("photo-3"), asset("cover-draft"), asset("logo-draft")],
      }),
    );
    expect(data.carouselSlides.map((s) => s.asset.id)).toEqual(["photo-2", "photo-3"]);
    expect(data.coverAsset?.id).toBe("cover-draft");
    expect(data.member.theme).toBe("teal");
  });
});
