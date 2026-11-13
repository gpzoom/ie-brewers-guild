import { describe, expect, it } from "vitest";
import { describeAuditEntry, isEditingAs } from "@/lib/guild/audit-log-view";

describe("describeAuditEntry", () => {
  it("names a deleted member from details", () => {
    expect(
      describeAuditEntry({ tableName: "members", action: "delete", details: { business_name: "Hop House" } }),
    ).toBe("Deleted the member Hop House");
    expect(describeAuditEntry({ tableName: "members", action: "delete", details: null })).toBe(
      "Deleted a member",
    );
  });

  it("reads Guild admin changes with the address", () => {
    expect(
      describeAuditEntry({
        tableName: "profiles",
        action: "update",
        details: { email: "a@b.co", change: "Guild admin access removed" },
      }),
    ).toBe("Guild admin access removed: a@b.co");
  });

  it("labels a broadcast send", () => {
    expect(
      describeAuditEntry({
        tableName: "broadcast_emails",
        action: "insert",
        details: { subject: "Hi", recipient_count: 3, failed_count: 0, audience: "All members" },
      }),
    ).toBe("Broadcast email sent");
  });

  it("words the everyday member edits", () => {
    expect(describeAuditEntry({ tableName: "member_drafts", action: "update", details: null })).toBe(
      "Saved a draft change",
    );
    expect(describeAuditEntry({ tableName: "media_assets", action: "insert", details: null })).toBe("Added a photo");
    expect(describeAuditEntry({ tableName: "auth.users", action: "update", details: null })).toBe(
      "Changed the member's sign-in email",
    );
  });

  it("falls back to the table name", () => {
    expect(describeAuditEntry({ tableName: "some_table", action: "insert", details: null })).toBe("Added some table");
  });

  it("words every People change from its details", () => {
    const d = (kind: string, extra: Record<string, unknown> = {}) => ({ kind, email: "a@b.com", ...extra });
    expect(
      describeAuditEntry({ tableName: "member_invites", action: "insert", details: d("invite", { role: "co_owner" }) }),
    ).toBe("Invited a@b.com as Co-owner");
    expect(describeAuditEntry({ tableName: "member_invites", action: "update", details: d("resend") })).toBe(
      "Resent the invite to a@b.com",
    );
    expect(describeAuditEntry({ tableName: "member_invites", action: "delete", details: d("cancel") })).toBe(
      "Canceled the invite to a@b.com",
    );
    expect(
      describeAuditEntry({ tableName: "member_users", action: "delete", details: d("remove", { role: "editor" }) }),
    ).toBe("Removed a@b.com (Full editor)");
    expect(
      describeAuditEntry({
        tableName: "member_users",
        action: "update",
        details: d("change_access", { fromRole: "editor", toRole: "co_owner" }),
      }),
    ).toBe("Changed a@b.com from Full editor to Co-owner");
    expect(describeAuditEntry({ tableName: "member_users", action: "delete", details: d("leave") })).toBe(
      "a@b.com left the profile",
    );
  });

  it("falls back to the raw role and a generic person when details are thin", () => {
    expect(
      describeAuditEntry({
        tableName: "member_invites",
        action: "insert",
        details: { kind: "invite", email: null, role: "mystery" },
      }),
    ).toBe("Invited someone as mystery");
  });

  it("keeps the old wording for rows without details", () => {
    expect(describeAuditEntry({ tableName: "member_invites", action: "insert", details: null })).toBe(
      "Invited someone to the profile",
    );
    expect(describeAuditEntry({ tableName: "member_users", action: "delete", details: null })).toBe(
      "Removed someone's access to the profile",
    );
  });
});

describe("isEditingAs", () => {
  const base = { memberId: "m1", actorUserId: "u1" };

  it("a leave row by someone no longer linked, not impersonating, is not 'editing as'", () => {
    expect(
      isEditingAs({ ...base, details: { kind: "leave", email: "a@b.co", impersonating: false } }, false),
    ).toBe(false);
  });

  it("a People row written while impersonating is 'editing as', even if the actor is linked", () => {
    expect(isEditingAs({ ...base, details: { kind: "invite", impersonating: true } }, true)).toBe(true);
    expect(isEditingAs({ ...base, details: { kind: "invite", impersonating: true } }, false)).toBe(true);
  });

  it("falls back to the linked check for rows without the flag", () => {
    expect(isEditingAs({ ...base, details: { kind: "remove" } }, false)).toBe(true);
    expect(isEditingAs({ ...base, details: null }, true)).toBe(false);
  });

  it("a row with no member is never 'editing as'", () => {
    expect(isEditingAs({ memberId: null, actorUserId: "u1", details: { impersonating: true } }, false)).toBe(false);
  });
});
