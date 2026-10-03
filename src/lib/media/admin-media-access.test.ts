import { describe, expect, it } from "vitest";
import { canViewAdminMedia, needsMembershipLookup } from "./admin-media-access";

describe("canViewAdminMedia", () => {
  const base = { assetMemberId: "m1", impersonation: null, isLinkedToAssetMember: false };

  it("refuses when nobody is signed in", () => {
    expect(canViewAdminMedia({ ...base, userId: null, isLinkedToAssetMember: true })).toBe(false);
  });

  it("allows a user linked to the asset's member", () => {
    expect(canViewAdminMedia({ ...base, userId: "u1", isLinkedToAssetMember: true })).toBe(true);
  });

  it("refuses a user not linked to the asset's member", () => {
    expect(canViewAdminMedia({ ...base, userId: "u1" })).toBe(false);
  });

  it("allows a Guild admin who is also linked to the member (no special case)", () => {
    expect(canViewAdminMedia({ ...base, userId: "admin", isLinkedToAssetMember: true })).toBe(true);
  });

  it("while impersonating, allows only the impersonated member's files", () => {
    const impersonation = { actorUserId: "admin", memberId: "m1" };
    expect(canViewAdminMedia({ ...base, userId: "admin", impersonation })).toBe(true);
    expect(
      canViewAdminMedia({
        ...base,
        userId: "admin",
        impersonation: { actorUserId: "admin", memberId: "m2" },
        // Even a real link to m1 doesn't widen an impersonation session.
        isLinkedToAssetMember: true,
      }),
    ).toBe(false);
  });

  it("ignores an impersonation cookie started by a different user", () => {
    const stale = { actorUserId: "other-admin", memberId: "m1" };
    expect(canViewAdminMedia({ ...base, userId: "u1", impersonation: stale })).toBe(false);
    expect(
      canViewAdminMedia({
        ...base,
        userId: "u1",
        impersonation: stale,
        isLinkedToAssetMember: true,
      }),
    ).toBe(true);
  });
});

describe("needsMembershipLookup", () => {
  it("skips the lookup when signed out or impersonating", () => {
    expect(needsMembershipLookup({ userId: null, impersonation: null })).toBe(false);
    expect(needsMembershipLookup({ userId: "a", impersonation: { actorUserId: "a" } })).toBe(false);
  });

  it("looks up for a normal session or a stale cookie", () => {
    expect(needsMembershipLookup({ userId: "u", impersonation: null })).toBe(true);
    expect(needsMembershipLookup({ userId: "u", impersonation: { actorUserId: "x" } })).toBe(true);
  });
});
