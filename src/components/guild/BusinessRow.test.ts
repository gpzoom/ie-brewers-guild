import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BusinessRow } from "./BusinessRow";
import type { RosterBusiness } from "@/lib/guild/roster-groups";

const base: RosterBusiness = {
  id: "b1",
  name: "Hangar 24 Brewing Co.",
  mode: "one_manager",
  hasManager: false,
  managerEmail: null,
  managerSignedIn: false,
};
const render = (business: RosterBusiness, isSuperAdmin = true) =>
  renderToStaticMarkup(
    createElement(BusinessRow, { business, locationCount: 4, busy: false, isSuperAdmin, onModeChange: vi.fn(), onInvite: vi.fn() }),
  );

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
    const html = render({ ...base, hasManager: true, managerEmail: "boss@x.com", managerSignedIn: true });
    expect(html).toContain("boss@x.com");
    expect(html).not.toContain(">Invite<");
  });

  it("a manager whose email can't be read still counts: no Invite, no 'no manager yet'", () => {
    const html = render({ ...base, hasManager: true, managerEmail: null });
    expect(html).not.toContain(">Invite<");
    expect(html).not.toContain("no manager yet");
  });

  it("Guild admin (not super admin): One manager is disabled and says Coming soon; separately stays usable", () => {
    const html = render({ ...base, mode: "separate" }, false);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>One manager/);
    expect(html).toContain("Coming soon");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Each location separately/);
  });

  it("Guild admin (not super admin): no business Invite", () => {
    expect(render(base, false)).not.toContain(">Invite<");
  });

  it("separate: no business-level Invite", () => {
    expect(render({ ...base, mode: "separate" })).not.toContain(">Invite<");
  });
});
