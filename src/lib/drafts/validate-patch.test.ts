import { describe, expect, it } from "vitest";
import { validateDraftPatch } from "./validate-patch";

const UUID = "f2000000-0000-4000-8000-000000000001";
const CROP = { x: 0, y: 0, w: 1, h: 1 };

describe("validateDraftPatch -- shape", () => {
  it("rejects an unknown section", () => {
    expect(() => validateDraftPatch("status", { status: "published" })).toThrow(
      "Unknown profile section.",
    );
  });
  it("rejects a non-object patch", () => {
    expect(() => validateDraftPatch("basics", null)).toThrow("Invalid update.");
    expect(() => validateDraftPatch("basics", [1])).toThrow("Invalid update.");
  });
  it("rejects keys outside the section (never member_type, status, slug)", () => {
    expect(() => validateDraftPatch("basics", { member_type: "allied" })).toThrow(
      "Invalid update.",
    );
    expect(() => validateDraftPatch("basics", { business_name: "X", status: "published" })).toThrow(
      "Invalid update.",
    );
    expect(() => validateDraftPatch("theme", { theme: "teal", slug: "x" })).toThrow(
      "Invalid update.",
    );
  });
  it("rejects an empty patch", () => {
    expect(() => validateDraftPatch("basics", {})).toThrow("Nothing to save.");
  });
});

describe("validateDraftPatch -- basics", () => {
  it("accepts ordinary field saves", () => {
    expect(
      validateDraftPatch("basics", { tagline: "Hops", phone: "555", contact_email: null }).patch,
    ).toEqual({
      tagline: "Hops",
      phone: "555",
      contact_email: null,
    });
  });
  it("keeps the old editors' non-empty rules", () => {
    expect(() => validateDraftPatch("basics", { business_name: "  " })).toThrow(
      "Business name can't be empty.",
    );
    expect(() => validateDraftPatch("basics", { city: "" })).toThrow("City can't be empty.");
    expect(() => validateDraftPatch("basics", { state: "" })).toThrow("State can't be empty.");
  });
  it("caps the tagline at 70", () => {
    expect(() => validateDraftPatch("basics", { tagline: "x".repeat(71) })).toThrow(
      /70 characters/,
    );
  });
  it("checks timezone, year and logo background", () => {
    expect(() => validateDraftPatch("basics", { timezone: "Mars/Olympus" })).toThrow(
      "Invalid timezone.",
    );
    expect(() => validateDraftPatch("basics", { member_since_year: 1700 })).toThrow(
      /Member-since year/,
    );
    expect(() => validateDraftPatch("basics", { member_since_year: 2000.5 })).toThrow(
      /Member-since year/,
    );
    expect(validateDraftPatch("basics", { member_since_year: null }).patch).toEqual({
      member_since_year: null,
    });
    expect(() => validateDraftPatch("basics", { logo_background: "neon" })).toThrow(
      "Invalid logo background.",
    );
  });
  it("checks a sales email loosely", () => {
    expect(() => validateDraftPatch("basics", { contact_email: "nope" })).toThrow(/email/);
    expect(
      validateDraftPatch("basics", { contact_email: "sales@brew.test" }).patch.contact_email,
    ).toBe("sales@brew.test");
  });
  it("checks photo ids and the cover crop", () => {
    expect(() => validateDraftPatch("basics", { cover_asset_id: "not-a-uuid" })).toThrow(/photo/);
    expect(
      validateDraftPatch("basics", { cover_asset_id: UUID, cover_crop: CROP }).patch.cover_asset_id,
    ).toBe(UUID);
    expect(() => validateDraftPatch("basics", { cover_crop: { x: 0 } })).toThrow(/cover crop/);
    expect(validateDraftPatch("basics", { cover_asset_id: null, cover_crop: null }).patch).toEqual({
      cover_asset_id: null,
      cover_crop: null,
    });
  });
  it("checks hours rows", () => {
    const good = {
      weekday: 1,
      opens_at: "09:00",
      closes_at: "17:00:00",
      closes_next_day: false,
      is_closed: false,
    };
    expect(validateDraftPatch("basics", { hours: [good] }).patch.hours).toEqual([good]);
    expect(() => validateDraftPatch("basics", { hours: [{ ...good, weekday: 7 }] })).toThrow(
      /Weekday/,
    );
    expect(() => validateDraftPatch("basics", { hours: [{ ...good, opens_at: "25:00" }] })).toThrow(
      /Opening time/,
    );
    expect(() => validateDraftPatch("basics", { hours: "Mon 9-5" })).toThrow("Invalid hours.");
  });
  it("checks special hours rows, including one per date", () => {
    const day = {
      date: "2026-11-26",
      is_closed: true,
      opens_at: null,
      closes_at: null,
      closes_next_day: false,
      note: null,
    };
    expect(validateDraftPatch("basics", { special_hours: [day] }).patch.special_hours).toEqual([
      day,
    ]);
    expect(() =>
      validateDraftPatch("basics", { special_hours: [{ ...day, date: "2026-02-30" }] }),
    ).toThrow(/calendar date/);
    expect(() =>
      validateDraftPatch("basics", { special_hours: [day, { ...day, note: "again" }] }),
    ).toThrow(/already have hours set for this date/);
  });
});

describe("validateDraftPatch -- media", () => {
  const slide = { asset_id: UUID, crop: CROP, outbound_url: null, sort_order: 0 };
  it("accepts slides", () => {
    expect(validateDraftPatch("media", { slides: [slide] }).patch.slides).toEqual([slide]);
  });
  it("holds at most four, in distinct slots 0-3", () => {
    const five = [0, 1, 2, 3, 3].map((sort_order) => ({ ...slide, sort_order }));
    expect(() => validateDraftPatch("media", { slides: five })).toThrow(/four/);
    expect(() => validateDraftPatch("media", { slides: [slide, { ...slide }] })).toThrow(
      /same position/,
    );
    expect(() => validateDraftPatch("media", { slides: [{ ...slide, sort_order: 4 }] })).toThrow(
      /0-3/,
    );
  });
  it("refuses a non-http tap-through link", () => {
    expect(() =>
      validateDraftPatch("media", { slides: [{ ...slide, outbound_url: "javascript:alert(1)" }] }),
    ).toThrow(/http/);
    expect(
      validateDraftPatch("media", { slides: [{ ...slide, outbound_url: "" }] }).patch.slides,
    ).toHaveLength(1);
  });
});

describe("validateDraftPatch -- links", () => {
  it("allows an empty URL while typing, refuses a bad scheme", () => {
    expect(
      validateDraftPatch("links", {
        links: [{ kind: "website", label: null, url: "", sort_order: 0 }],
      }).patch,
    ).toBeTruthy();
    expect(() =>
      validateDraftPatch("links", {
        links: [{ kind: "website", label: null, url: "javascript:x", sort_order: 0 }],
      }),
    ).toThrow(/http/);
  });
  it("refuses an unknown link type", () => {
    expect(() =>
      validateDraftPatch("links", {
        links: [{ kind: "myspace", label: null, url: "", sort_order: 0 }],
      }),
    ).toThrow("Unknown link type.");
  });
});

describe("validateDraftPatch -- discount", () => {
  it("applies the percent / no-fixed XOR", () => {
    expect(validateDraftPatch("discount", { discount_no_fixed_percent: true }).patch).toEqual({
      discount_no_fixed_percent: true,
      discount_percent: null,
    });
    expect(validateDraftPatch("discount", { discount_percent: 15 }).patch).toEqual({
      discount_percent: 15,
      discount_no_fixed_percent: false,
    });
  });
  it("checks the range and whole numbers", () => {
    expect(() => validateDraftPatch("discount", { discount_percent: 101 })).toThrow(
      /between 0 and 100/,
    );
    expect(() => validateDraftPatch("discount", { discount_percent: 12.5 })).toThrow(
      /whole number/,
    );
    expect(() => validateDraftPatch("discount", { discount_percent: "10" })).toThrow(/number/);
  });
  it("checks category ids", () => {
    expect(() => validateDraftPatch("discount", { category_ids: ["x"] })).toThrow(/categories/);
    expect(validateDraftPatch("discount", { category_ids: [UUID] }).patch.category_ids).toEqual([
      UUID,
    ]);
  });
});

describe("validateDraftPatch -- theme", () => {
  it("accepts one of the eight, refuses anything else", () => {
    expect(validateDraftPatch("theme", { theme: "teal" }).patch).toEqual({ theme: "teal" });
    expect(() => validateDraftPatch("theme", { theme: "neon" })).toThrow(/eight themes/);
  });
});

describe("validateDraftPatch -- basics address (ZIP and map pin)", () => {
  it("accepts a picked address saved in one patch", () => {
    const patch = {
      street_address: "1710 Sessums Drive",
      city: "Redlands",
      state: "CA",
      postal_code: "92374",
      latitude: 34.066,
      longitude: -117.2,
    };
    expect(validateDraftPatch("basics", patch).patch).toEqual(patch);
  });
  it("accepts ZIP+4, an empty ZIP (null) and cleared coordinates", () => {
    expect(() => validateDraftPatch("basics", { postal_code: "92374-1234" })).not.toThrow();
    expect(() =>
      validateDraftPatch("basics", { postal_code: null, latitude: null, longitude: null }),
    ).not.toThrow();
  });
  it("rejects a malformed ZIP", () => {
    for (const bad of ["9237", "ABCDE", "92374-12", 92374]) {
      expect(() => validateDraftPatch("basics", { postal_code: bad })).toThrow("ZIP");
    }
  });
  it("rejects half a pin, out-of-range or non-numeric coordinates", () => {
    expect(() => validateDraftPatch("basics", { latitude: 34 })).toThrow("Invalid map location.");
    expect(() => validateDraftPatch("basics", { latitude: 34, longitude: null })).toThrow(
      "Invalid map location.",
    );
    expect(() => validateDraftPatch("basics", { latitude: 91, longitude: 0 })).toThrow(
      "Invalid map location.",
    );
    expect(() => validateDraftPatch("basics", { latitude: 0, longitude: -181 })).toThrow(
      "Invalid map location.",
    );
    expect(() => validateDraftPatch("basics", { latitude: "34", longitude: "-117" })).toThrow(
      "Invalid map location.",
    );
  });
});
