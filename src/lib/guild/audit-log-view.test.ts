import { describe, expect, it } from "vitest";
import { describeAuditEntry } from "@/lib/guild/audit-log-view";

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
});
