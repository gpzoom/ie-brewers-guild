import { describe, expect, it, vi } from "vitest";
import { resendInviteCore, type ResendInviteDeps } from "./resend-invite-core";

function deps(over: Partial<ResendInviteDeps> = {}): ResendInviteDeps {
  return {
    loadMember: async () => ({ businessName: "Mars Brewing", business: null }),
    loadOwnerUserId: async () => "owner-1",
    loadUser: async () => ({ email: "Owner@Mars.example", lastSignInAt: null }),
    sendMemberInvite: vi.fn(async () => {}),
    sendBusinessInvite: vi.fn(async () => {}),
    ...over,
  };
}

const oneManager = {
  id: "biz",
  name: "Metabolic Brewing Co.",
  mode: "one_manager" as const,
  managerUserId: "manager-1",
  locationCount: 3,
};

describe("resendInviteCore (roster Re-invite)", () => {
  it("sends the Member invite again to the invited owner's address", async () => {
    const d = deps();
    await expect(resendInviteCore(d, "m1")).resolves.toEqual({ ok: true, email: "owner@mars.example" });
    expect(d.sendMemberInvite).toHaveBeenCalledWith({ memberId: "m1", email: "owner@mars.example", businessName: "Mars Brewing" });
    expect(d.sendBusinessInvite).not.toHaveBeenCalled();
  });

  it("a one-manager location sends the Business invite again to its manager", async () => {
    const d = deps({
      loadMember: async () => ({ businessName: "Metabolic Brewing Co.", business: oneManager }),
      loadOwnerUserId: async () => "manager-1",
      loadUser: async (id) => ({ email: id === "manager-1" ? "boss@metabolic.example" : "x@x.com", lastSignInAt: null }),
    });
    await resendInviteCore(d, "m1");
    expect(d.sendBusinessInvite).toHaveBeenCalledWith({
      businessId: "biz",
      businessName: "Metabolic Brewing Co.",
      locationCount: 3,
      email: "boss@metabolic.example",
    });
    expect(d.sendMemberInvite).not.toHaveBeenCalled();
  });

  it("a handed-off location of a one-manager business re-invites its own owner", async () => {
    const d = deps({
      loadMember: async () => ({ businessName: "Metabolic Brewing Co.", business: oneManager }),
      loadOwnerUserId: async () => "owner-2",
    });
    await resendInviteCore(d, "m1");
    expect(d.sendMemberInvite).toHaveBeenCalled();
    expect(d.sendBusinessInvite).not.toHaveBeenCalled();
  });

  it("refuses when nobody was invited, or they've already signed in", async () => {
    await expect(resendInviteCore(deps({ loadOwnerUserId: async () => null }), "m1")).rejects.toThrow("Use Invite instead");
    const signedIn = deps({ loadUser: async () => ({ email: "a@x.com", lastSignInAt: "2026-10-01" }) });
    await expect(resendInviteCore(signedIn, "m1")).rejects.toThrow("already signed in");
    expect(signedIn.sendMemberInvite).not.toHaveBeenCalled();
  });

  it("reports a failed send", async () => {
    const d = deps({ sendMemberInvite: async () => { throw new Error("Resend is down"); } });
    await expect(resendInviteCore(d, "m1")).rejects.toThrow("Resend is down");
  });
});
