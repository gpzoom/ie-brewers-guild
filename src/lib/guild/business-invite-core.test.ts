import { describe, expect, it, vi } from "vitest";
import { inviteBusinessManagerCore, type BusinessInviteDeps } from "./business-invite-core";

function deps(over: Partial<BusinessInviteDeps> = {}): BusinessInviteDeps {
  return {
    loadBusiness: vi.fn(async () => ({ name: "Hangar 24 Brewing Co.", mode: "one_manager" as const, managerUserId: null, locationCount: 4 })),
    createUser: vi.fn(async () => ({ ok: true as const, userId: "new-user" })),
    findUserIdByEmail: vi.fn(async () => "existing-user"),
    linkManager: vi.fn(async () => ({ ok: true as const })),
    deleteUser: vi.fn(async () => {}),
    sendInviteEmail: vi.fn(async () => {}),
    ...over,
  };
}

describe("inviteBusinessManagerCore", () => {
  it("a new email: creates the account, links it as manager, sends the business invite", async () => {
    const d = deps();
    await expect(inviteBusinessManagerCore(d, { businessId: "b", email: " Boss@X.com " })).resolves.toEqual({ ok: true, userId: "new-user", existing: false });
    expect(d.createUser).toHaveBeenCalledWith("boss@x.com");
    expect(d.linkManager).toHaveBeenCalledWith("b", "new-user");
    expect(d.sendInviteEmail).toHaveBeenCalledWith({ businessId: "b", businessName: "Hangar 24 Brewing Co.", locationCount: 4, email: "boss@x.com" });
  });

  it("an email that already has an account links that account and never deletes it", async () => {
    const d = deps({
      createUser: vi.fn(async () => ({ ok: false as const, emailTaken: true, message: "already registered" })),
      linkManager: vi.fn(async () => ({ ok: false as const, message: "boom" })),
    });
    await expect(inviteBusinessManagerCore(d, { businessId: "b", email: "a@x.com" })).rejects.toThrow("boom");
    expect(d.linkManager).toHaveBeenCalledWith("b", "existing-user");
    expect(d.deleteUser).not.toHaveBeenCalled();
  });

  it("removes a just-created account when linking fails", async () => {
    const d = deps({ linkManager: vi.fn(async () => ({ ok: false as const, message: "boom" })) });
    await expect(inviteBusinessManagerCore(d, { businessId: "b", email: "a@x.com" })).rejects.toThrow("boom");
    expect(d.deleteUser).toHaveBeenCalledWith("new-user");
  });

  it("refuses before creating anything when the business isn't one-manager or already has a manager", async () => {
    const separate = deps({ loadBusiness: vi.fn(async () => ({ name: "B", mode: "separate" as const, managerUserId: null, locationCount: 2 })) });
    await expect(inviteBusinessManagerCore(separate, { businessId: "b", email: "a@x.com" })).rejects.toThrow("Set this business to One manager first.");
    expect(separate.createUser).not.toHaveBeenCalled();

    const managed = deps({ loadBusiness: vi.fn(async () => ({ name: "B", mode: "one_manager" as const, managerUserId: "u", locationCount: 2 })) });
    await expect(inviteBusinessManagerCore(managed, { businessId: "b", email: "a@x.com" })).rejects.toThrow("This business already has a manager.");
    expect(managed.createUser).not.toHaveBeenCalled();
  });

  it("a failed email never undoes the invite", async () => {
    const d = deps({ sendInviteEmail: vi.fn(async () => { throw new Error("resend down"); }) });
    await expect(inviteBusinessManagerCore(d, { businessId: "b", email: "a@x.com" })).resolves.toMatchObject({ ok: true });
  });
});
