import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BusinessRow } from "./BusinessRow";
import type { RosterBusiness } from "@/lib/guild/roster-groups";

const base: RosterBusiness = { id: "b1", name: "Hangar 24 Brewing Co.", mode: "one_manager", managerEmail: null, managerSignedIn: false };
const render = (business: RosterBusiness) =>
  renderToStaticMarkup(createElement(BusinessRow, { business, locationCount: 4, busy: false, onModeChange: vi.fn(), onInvite: vi.fn() }));

describe("BusinessRow (artboard BZ1)", () => {
  it("names the business and its location count", () => {
    expect(render(base)).toContain("Hangar 24 Brewing Co.");
    expect(render(base)).toContain("4 locations");
  });

  it("Managed by shows both choices with the current one pressed", () => {
    const html = render(base);
    expect(html).toMatch(/aria-pressed="true"[^>]*>One manager/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Each location separately/);
  });

  it("one-manager with no manager yet: one Invite button", () => {
    expect(render(base)).toContain(">Invite<");
  });

  it("one-manager with a manager: shows who, no Invite", () => {
    const html = render({ ...base, managerEmail: "boss@x.com", managerSignedIn: true });
    expect(html).toContain("boss@x.com");
    expect(html).not.toContain(">Invite<");
  });

  it("separate: no business-level Invite", () => {
    expect(render({ ...base, mode: "separate" })).not.toContain(">Invite<");
  });
});
