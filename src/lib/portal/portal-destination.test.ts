import { describe, expect, it } from "vitest";
import { isPortalRole, resolvePortalDestination } from "./portal-destination";

const T = "2026-09-25T12:00:00Z";

describe("resolvePortalDestination", () => {
  it.each(["owner", "editor"] as const)("%s: nothing done → wizard welcome", (role) => {
    expect(resolvePortalDestination({ typeConfirmedAt: null, setupCompletedAt: null, role })).toEqual({
      kind: "wizard",
      step: "welcome",
    });
  });

  it.each(["owner", "editor"] as const)("%s: type confirmed, setup not done → wizard basics", (role) => {
    expect(resolvePortalDestination({ typeConfirmedAt: T, setupCompletedAt: null, role })).toEqual({
      kind: "wizard",
      step: "basics",
    });
  });

  it.each(["owner", "editor"] as const)("%s: both set → portal", (role) => {
    expect(resolvePortalDestination({ typeConfirmedAt: T, setupCompletedAt: T, role })).toEqual({ kind: "portal" });
  });

  it("setup completed without a confirmed type is still setup (welcome)", () => {
    expect(resolvePortalDestination({ typeConfirmedAt: null, setupCompletedAt: T, role: "owner" })).toEqual({
      kind: "wizard",
      step: "welcome",
    });
  });

  it.each([
    [null, null],
    [T, null],
    [T, T],
  ])("media_events always gets the portal (type %s, setup %s)", (typeConfirmedAt, setupCompletedAt) => {
    expect(resolvePortalDestination({ typeConfirmedAt, setupCompletedAt, role: "media_events" })).toEqual({
      kind: "portal",
    });
  });
});

describe("isPortalRole", () => {
  it("accepts the three roles only", () => {
    expect(isPortalRole("owner")).toBe(true);
    expect(isPortalRole("editor")).toBe(true);
    expect(isPortalRole("media_events")).toBe(true);
    expect(isPortalRole("admin")).toBe(false);
    expect(isPortalRole(null)).toBe(false);
  });
});
