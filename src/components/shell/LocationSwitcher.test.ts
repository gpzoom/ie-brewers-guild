import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: "/portal/events", search: {}, hash: "" } }),
}));
vi.mock("@/lib/portal/portal-session.server", () => ({ choosePortalMember: vi.fn() }));

import { LocationSwitcher, STATUS_LABEL } from "./LocationSwitcher";

const data = {
  businessName: "Hangar 24 Brewing Co.",
  currentMemberId: "r",
  locations: [
    { memberId: "i", city: "Irvine", label: "Irvine", status: "not_started" as const },
    { memberId: "r", city: "Riverside", label: "Riverside · 100 Main St", status: "live" as const },
  ],
};

describe("LocationSwitcher (artboard BZ2)", () => {
  it("the trigger names the business and the current city", () => {
    const html = renderToStaticMarkup(createElement(LocationSwitcher, { data }));
    expect(html).toContain("Hangar 24 Brewing Co.");
    expect(html).toContain("Riverside · 100 Main St");
    expect(html).toMatch(/aria-label="Switch location[^"]*"/);
  });

  it("the dark tone shows the business and current label without the light box", () => {
    const html = renderToStaticMarkup(createElement(LocationSwitcher, { data, tone: "dark" }));
    expect(html).toContain("Hangar 24 Brewing Co.");
    expect(html).toContain("Riverside · 100 Main St");
    expect(html).not.toContain("bg-white");
  });

  it("status labels match the artboard", () => {
    expect(STATUS_LABEL).toEqual({ live: "Live", setting_up: "Setting up", not_started: "Not started" });
  });
});
