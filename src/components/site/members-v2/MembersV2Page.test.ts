import { describe, expect, it, vi } from "vitest";
vi.mock("@vis.gl/react-google-maps", () => ({}));
vi.mock("./MembersV2Map", () => ({ MembersV2Map: () => null }));
vi.mock("@tanstack/react-router", () => ({ Link: () => null, useNavigate: () => () => {} }));
const { visibleCards, MembersV2Page } = await import("./MembersV2Page");
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { V2Card } from "@/lib/members/members-v2";

const c = (name: string, memberType: V2Card["memberType"], lat: number | null, lng: number | null, stopPin: V2Card["stopPin"] = null): V2Card => ({
  key: name, name, memberType, website: null, logo: null, tag: null, mobileIcon: null, stop: null, stopPin,
  locations: [{ slug: name, city: "Riverside", street: null, address: "", lat, lng }],
});

describe("visibleCards", () => {
  const cards = [c("Bravo", "producer", 34.06, -117.65), c("Alpha", "producer", null, null), c("Truck", "mobile", null, null, { lat: 33.98, lng: -117.37 })];
  it("A–Z by default", () => {
    expect(visibleCards(cards, { query: "", origin: null }).map((x) => x.name)).toEqual(["Alpha", "Bravo", "Truck"]);
  });
  it("Near me: nearest first; a mobile member counts at today's stop; no pin last", () => {
    const origin = { lat: 33.9806, lng: -117.3755 };
    expect(visibleCards(cards, { query: "", origin }).map((x) => x.name)).toEqual(["Truck", "Bravo", "Alpha"]);
  });
  it("type filter and search apply together", () => {
    expect(visibleCards(cards, { query: "tru", type: "mobile", origin: null }).map((x) => x.name)).toEqual(["Truck"]);
  });
});

describe("phone search bar", () => {
  it("sticks just below the 73px site header, not under it", () => {
    const html = renderToStaticMarkup(createElement(MembersV2Page, { cards: [], pins: [], search: {} }));
    expect(html).toContain("top-[73px]");
    expect(html).not.toContain("top-14");
  });
});
