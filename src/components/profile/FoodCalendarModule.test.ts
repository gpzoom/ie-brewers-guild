import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, className }: { children: unknown; to: string; params?: { slug: string }; className?: string }) =>
    createElement("a", { href: to.replace("$slug", params?.slug ?? ""), className }, children as never),
}));

const { FoodCalendarModule } = await import("./FoodCalendarModule");

const base = {
  slots: [],
  now: new Date("2026-09-30T17:00:00Z"),
  timezone: "America/Los_Angeles",
  hours: [],
  specialHours: [],
};

describe("FoodCalendarModule", () => {
  it("says 'Kitchen open' on empty days when the taproom has its own kitchen", () => {
    const html = renderToStaticMarkup(createElement(FoodCalendarModule, { ...base, hasKitchen: true }));
    expect(html).toContain("Kitchen open");
    expect(html).not.toContain("Bring your own food");
  });

  it("still says 'Bring your own food' without the switch", () => {
    const html = renderToStaticMarkup(createElement(FoodCalendarModule, base));
    expect(html).toContain("Bring your own food");
  });
});

describe("FoodCalendarModule: Guild food vendors", () => {
  it("a Guild vendor's day links to their profile, with the GUILD MEMBER mark", () => {
    const guestSlots = [
      {
        id: "g", member_id: "t", calendar_connection_id: null, source: "manual" as const, kind: "event" as const, external_event_id: null,
        title: null, description: null, starts_at: "2026-10-01T01:00:00Z", ends_at: null, all_day: false,
        venue_name: "Mars Brewing Co.", city: null, address: null, overlay_status: null, overlay_starts_at: null,
        overlay_note: null, overlay_set_at: null, is_hidden: false,
        guest: { name: "Sample Taco Truck", slug: "taco", tag: "FOOD TRUCK", food: true },
      },
    ];
    const html = renderToStaticMarkup(createElement(FoodCalendarModule, { ...base, guestSlots }));
    expect(html).toMatch(/<a href="\/members\/taco"[^>]*>Sample Taco Truck<\/a>/);
    expect(html).toContain("GUILD MEMBER");
  });
});
