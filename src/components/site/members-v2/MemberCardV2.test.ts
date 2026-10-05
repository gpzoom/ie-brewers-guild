import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, className }: { children: unknown; to: string; params?: { slug: string }; className?: string }) =>
    createElement("a", { href: to.replace("$slug", params?.slug ?? ""), className }, children as never),
}));

const { MemberCardV2, stopLineText } = await import("./MemberCardV2");
import type { V2Card } from "@/lib/members/members-v2";

function card(o: Partial<V2Card>): V2Card {
  return {
    key: "Hangar 24 Brewing Co.", name: "Hangar 24 Brewing Co.", memberType: "producer", website: "https://hangar24.example",
    logo: null, tag: null, mobileIcon: null, stop: null, stopPin: null,
    locations: [
      { slug: "h24-irvine", city: "Irvine", street: "17877 Von Karman Ave", address: "17877 Von Karman Ave, Irvine, CA", lat: 33.69, lng: -117.85 },
      { slug: "h24-redlands", city: "Redlands", street: "1710 Sessums Dr", address: "1710 Sessums Dr, Redlands, CA", lat: 34.06, lng: -117.2 },
      { slug: "h24-riverside", city: "Riverside", street: "5225 Canyon Crest Dr", address: "5225 Canyon Crest Dr, Riverside, CA", lat: 33.95, lng: -117.33 },
    ],
    ...o,
  };
}
const render = (c: V2Card) =>
  renderToStaticMarkup(createElement(MemberCardV2, { card: c, linkSearch: {}, origin: null, highlighted: false, focusedSlug: null, onHoverCard: () => {}, onHoverLocation: () => {} }));

describe("MemberCardV2", () => {
  it("several locations: 'N locations', two rows, '+ 1 more location', Website and Profile once", () => {
    const html = render(card({}));
    expect(html).toContain("3 locations");
    expect(html).toContain("Irvine");
    expect(html).toContain("Redlands");
    expect(html).toContain("+ 1 more location");
    expect(html.match(/Profile/g)).toHaveLength(1);
    expect(html).toContain('href="/members/h24-irvine"');
  });

  it("one location: address line with Directions, Website and Profile →", () => {
    const html = render(card({ locations: [card({}).locations[0]] }));
    expect(html).not.toContain("locations");
    expect(html).toContain("17877 Von Karman Ave, Irvine");
    expect(html).toContain("Directions");
    expect(html).toContain("Profile");
  });

  it.each([
    [{ state: "at-member", hostName: "All Points Brewing Co.", time: "5–9 pm" }, "Today at All Points Brewing Co. · 5–9 pm"],
    [{ state: "at-address", venue: "Riverside Food Truck Night", address: "3900 Main St", time: "4–10 pm" }, "Today at Riverside Food Truck Night · 4–10 pm"],
    [{ state: "in-city", place: "Corona", time: "6–9 pm" }, "Today in Corona · 6–9 pm"],
    [{ state: "next", day: "Fri", city: "Riverside" }, "No stop today. Next: Fri · Riverside"],
    [{ state: "none" }, "No stops scheduled"],
  ] as const)("mobile stop line %j", (stop, text) => {
    expect(stopLineText(card({ memberType: "mobile", tag: "FOOD TRUCK", mobileIcon: "truck", stop: { ...stop } as V2Card["stop"] }))).toBe(text);
  });

  it("a mobile card with no pin today shows Schedule instead of Directions", () => {
    const html = render(card({ memberType: "mobile", tag: "ENTERTAINMENT", mobileIcon: "mic", stop: { state: "in-city", place: "Corona", time: "6–9 pm" }, locations: [{ slug: "k", city: "Riverside", street: null, address: "Riverside, CA", lat: null, lng: null }] }));
    expect(html).toContain("ENTERTAINMENT");
    expect(html).toContain("Schedule");
    expect(html).not.toContain("Directions");
  });
});
