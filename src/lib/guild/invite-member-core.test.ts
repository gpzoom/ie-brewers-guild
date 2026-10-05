import { describe, expect, it, vi } from "vitest";
import { inviteMemberCore, type InviteDeps } from "./invite-member-core";

function deps(over: Partial<InviteDeps> = {}): InviteDeps {
  return {
    hasOwner: vi.fn(async () => false),
    createUser: vi.fn(async () => ({ ok: true as const, userId: "new-user" })),
    findUserIdByEmail: vi.fn(async () => "existing-user"),
    linkOwner: vi.fn(async () => ({ ok: true as const })),
    deleteUser: vi.fn(async () => {}),
    sendInviteEmail: vi.fn(async () => {}),
    ...over,
  };
}

describe("inviteMemberCore", () => {
  it("a new email: creates the account, links it as owner, sends the invite", async () => {
    const d = deps();
    await expect(inviteMemberCore(d, { memberId: "m", email: "new@x.com" })).resolves.toEqual({ ok: true, userId: "new-user", existing: false });
    expect(d.linkOwner).toHaveBeenCalledWith("m", "new-user");
    expect(d.sendInviteEmail).toHaveBeenCalled();
  });

  it("an email that already has an account (signed in on their own): links that account, sends the invite", async () => {
    const d = deps({ createUser: vi.fn(async () => ({ ok: false as const, emailTaken: true, message: "already registered" })) });
    await expect(inviteMemberCore(d, { memberId: "m", email: "Andy@MarsBrewing.com" })).resolves.toEqual({ ok: true, userId: "existing-user", existing: true });
    expect(d.findUserIdByEmail).toHaveBeenCalledWith("andy@marsbrewing.com");
    expect(d.linkOwner).toHaveBeenCalledWith("m", "existing-user");
    expect(d.sendInviteEmail).toHaveBeenCalled();
  });

  it("never deletes an existing account when linking fails", async () => {
    const d = deps({
      createUser: vi.fn(async () => ({ ok: false as const, emailTaken: true, message: "already registered" })),
      linkOwner: vi.fn(async () => ({ ok: false as const, message: "boom" })),
    });
    await expect(inviteMemberCore(d, { memberId: "m", email: "a@x.com" })).rejects.toThrow("boom");
    expect(d.deleteUser).not.toHaveBeenCalled();
  });

  it("a just-created account is removed again when linking fails", async () => {
    const d = deps({ linkOwner: vi.fn(async () => ({ ok: false as const, message: "boom" })) });
    await expect(inviteMemberCore(d, { memberId: "m", email: "a@x.com" })).rejects.toThrow("boom");
    expect(d.deleteUser).toHaveBeenCalledWith("new-user");
  });

  it("a business that already has an owner: refused, nothing created", async () => {
    const d = deps({ hasOwner: vi.fn(async () => true) });
    await expect(inviteMemberCore(d, { memberId: "m", email: "a@x.com" })).rejects.toThrow("already has an owner");
    expect(d.createUser).not.toHaveBeenCalled();
  });

  it("a send failure doesn't undo the invite", async () => {
    const d = deps({ sendInviteEmail: vi.fn(async () => { throw new Error("resend down"); }) });
    await expect(inviteMemberCore(d, { memberId: "m", email: "a@x.com" })).resolves.toMatchObject({ ok: true });
  });
});
