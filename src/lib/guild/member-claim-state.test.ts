import { describe, expect, it } from "vitest";
import { resolveMemberClaimState } from "./member-claim-state";

describe("resolveMemberClaimState", () => {
  it("is unclaimed when no member_users row exists", () => {
    expect(resolveMemberClaimState({ hasMemberUser: false, lastSignInAt: null })).toBe("unclaimed");
  });

  it("is invited_not_signed_in when a member_users row exists but last_sign_in_at is null", () => {
    expect(resolveMemberClaimState({ hasMemberUser: true, lastSignInAt: null })).toBe("invited_not_signed_in");
  });

  it("is claimed once last_sign_in_at is set", () => {
    expect(resolveMemberClaimState({ hasMemberUser: true, lastSignInAt: "2026-09-01T00:00:00Z" })).toBe("claimed");
  });
});
