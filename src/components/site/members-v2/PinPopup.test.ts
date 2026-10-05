import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: unknown }) => createElement("a", { href: "/members/x" }, children as never),
}));
vi.mock("@vis.gl/react-google-maps", () => ({}));
const { PinPopup } = await import("./MembersV2Map");

describe("PinPopup", () => {
  it("keeps the Website link, as on /members", () => {
    const pin = { key: "a", cardKey: "A", slug: "a", name: "A", city: "Riverside", address: "1 Main St", lat: 1, lng: 2,
      kind: "location" as const, icon: null, website: "https://a.example/", stopLine: null };
    const html = renderToStaticMarkup(createElement(PinPopup, { pin, linkSearch: {} }));
    expect(html).toContain('href="https://a.example/"');
    expect(html).toContain("Website");
    expect(html).toContain("Profile");
  });
});
