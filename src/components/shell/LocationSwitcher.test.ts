import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
  useRouterState: () => "/portal/events",
}));
vi.mock("@/lib/portal/portal-session.server", () => ({ choosePortalMember: vi.fn() }));

import { LocationSwitcher, STATUS_LABEL } from "./LocationSwitcher";

const data = {
  businessName: "Hangar 24 Brewing Co.",
  currentMemberId: "r",
  locations: [
    { memberId: "i", city: "Irvine", status: "not_started" as const },
    { memberId: "r", city: "Riverside", status: "live" as const },
  ],
};

describe("LocationSwitcher (artboard BZ2)", () => {
  it("the trigger names the business and the current city", () => {
    const html = renderToStaticMarkup(createElement(LocationSwitcher, { data }));
    expect(html).toContain("Hangar 24 Brewing Co.");
    expect(html).toContain("Riverside");
    expect(html).toMatch(/aria-label="Switch location[^"]*"/);
  });

  it("status labels match the artboard", () => {
    expect(STATUS_LABEL).toEqual({ live: "Live", setting_up: "Setting up", not_started: "Not started" });
  });
});
