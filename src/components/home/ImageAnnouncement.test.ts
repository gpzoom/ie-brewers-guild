import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CommunityEvent } from "@/lib/home/sections";

// Internal links go through the router's Link (no full page reload).
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, className }: { children: unknown; to: string; params?: { slug: string }; className?: string }) =>
    createElement("a", { href: to.replace("$slug", params?.slug ?? ""), className, "data-router-link": "" }, children as never),
}));

const { ImageAnnouncement } = await import("./ImageAnnouncement");

type Img = CommunityEvent;
const section = (link: Img["link"]): Img => ({
  id: "i1",
  imageUrl: "https://example.com/a.jpg",
  alt: "Holiday parties",
  width: 1200,
  height: 600,
  link,
});
const render = (link: Img["link"]) => renderToStaticMarkup(createElement(ImageAnnouncement, { section: section(link) }));

describe("ImageAnnouncement links", () => {
  it("a site page uses the router link, same tab", () => {
    const html = render({ href: "/about", external: false });
    expect(html).toContain("data-router-link");
    expect(html).toContain('href="/about"');
    expect(html).not.toContain("_blank");
  });
  it("a member page uses the router link with the slug", () => {
    const html = render({ href: "/members/sample-brewery", external: false });
    expect(html).toContain("data-router-link");
    expect(html).toContain('href="/members/sample-brewery"');
  });
  it("an outside address stays a plain new-tab link", () => {
    const html = render({ href: "https://example.com/x", external: true });
    expect(html).not.toContain("data-router-link");
    expect(html).toContain('target="_blank"');
  });
});
