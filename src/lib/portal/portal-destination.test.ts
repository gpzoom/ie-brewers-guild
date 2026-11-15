import { describe, expect, it } from "vitest";
import { isOwnerLevel, isPortalRole, resolvePortalDestination } from "./portal-destination";

const T = "2026-09-25T12:00:00Z";

describe("resolvePortalDestination", () => {
  it.each(["owner", "co_owner", "editor"] as const)("%s: nothing done → wizard welcome", (role) => {
    expect(resolvePortalDestination({ typeConfirmedAt: null, setupCompletedAt: null, role, status: "draft" })).toEqual({
      kind: "wizard",
      step: "welcome",
    });
  });

  it.each(["owner", "co_owner", "editor"] as const)("%s: type confirmed, setup not done → wizard basics", (role) => {
    expect(resolvePortalDestination({ typeConfirmedAt: T, setupCompletedAt: null, role, status: "draft" })).toEqual({
      kind: "wizard",
      step: "basics",
    });
  });

  it.each(["owner", "co_owner", "editor"] as const)("%s: both set → portal", (role) => {
    expect(resolvePortalDestination({ typeConfirmedAt: T, setupCompletedAt: T, role, status: "published" })).toEqual({ kind: "portal" });
  });

  it("setup completed without a confirmed type is still setup (welcome)", () => {
    expect(resolvePortalDestination({ typeConfirmedAt: null, setupCompletedAt: T, role: "owner", status: "draft" })).toEqual({
      kind: "wizard",
      step: "welcome",
    });
  });

  it.each([
    [null, null],
    [T, null],
    [T, T],
  ])("media_events always gets the portal (type %s, setup %s)", (typeConfirmedAt, setupCompletedAt) => {
    expect(resolvePortalDestination({ typeConfirmedAt, setupCompletedAt, role: "media_events", status: "draft" })).toEqual({
      kind: "portal",
    });
  });
});

describe("resolvePortalDestination: member status (Join the Guild)", () => {
  const roles = ["owner", "co_owner", "editor", "media_events"] as const;

  it.each(roles)("%s on an applied member → join-finish, before any wizard rule", (role) => {
    for (const [typeConfirmedAt, setupCompletedAt] of [
      [null, null],
      [T, null],
      [T, T],
    ] as const) {
      expect(resolvePortalDestination({ typeConfirmedAt, setupCompletedAt, role, status: "applied" })).toEqual({
        kind: "join-finish",
      });
    }
  });

  it.each(roles)("%s on a declined member → inactive", (role) => {
    expect(resolvePortalDestination({ typeConfirmedAt: null, setupCompletedAt: null, role, status: "declined" })).toEqual({
      kind: "inactive",
    });
    expect(resolvePortalDestination({ typeConfirmedAt: T, setupCompletedAt: T, role, status: "declined" })).toEqual({
      kind: "inactive",
    });
  });

  it.each(["draft", "published", "suspended"] as const)("%s keeps the wizard-or-portal rule", (status) => {
    expect(resolvePortalDestination({ typeConfirmedAt: null, setupCompletedAt: null, role: "owner", status })).toEqual({
      kind: "wizard",
      step: "welcome",
    });
    expect(resolvePortalDestination({ typeConfirmedAt: T, setupCompletedAt: null, role: "owner", status })).toEqual({
      kind: "wizard",
      step: "basics",
    });
    expect(resolvePortalDestination({ typeConfirmedAt: T, setupCompletedAt: T, role: "owner", status })).toEqual({
      kind: "portal",
    });
    expect(resolvePortalDestination({ typeConfirmedAt: null, setupCompletedAt: null, role: "media_events", status })).toEqual({
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

describe("isOwnerLevel", () => {
  it("is true for the owner and a co-owner only", () => {
    expect(isOwnerLevel("owner")).toBe(true);
    expect(isOwnerLevel("co_owner")).toBe(true);
    expect(isOwnerLevel("editor")).toBe(false);
    expect(isOwnerLevel("media_events")).toBe(false);
    expect(isOwnerLevel(null)).toBe(false);
    expect(isOwnerLevel(undefined)).toBe(false);
  });
});

describe("isPortalRole co_owner", () => {
  it("accepts co_owner", () => {
    expect(isPortalRole("co_owner")).toBe(true);
  });
});
