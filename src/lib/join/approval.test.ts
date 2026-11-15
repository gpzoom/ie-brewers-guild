import { describe, expect, it } from "vitest";
import { approvalPatch, shouldSendWelcome } from "./approval";

const now = new Date("2026-11-15T12:00:00.000Z");

describe("approvalPatch", () => {
  it("approving an applicant moves them to Draft", () => {
    expect(approvalPatch("applied", "u1", now)).toEqual({
      status: "draft",
      approved_at: "2026-11-15T12:00:00.000Z",
      approved_by_user_id: "u1",
    });
  });

  it.each(["draft", "published", "declined", "suspended"] as const)("%s still goes to published", (status) => {
    expect(approvalPatch(status, "u1", now).status).toBe("published");
  });
});

describe("shouldSendWelcome", () => {
  const base = { status: "published" as const, applied_via_join_at: "2026-11-01T00:00:00Z", join_welcomed_at: null };
  it("is true for a published applicant not yet welcomed", () => {
    expect(shouldSendWelcome(base)).toBe(true);
  });
  it("is false when not published", () => {
    expect(shouldSendWelcome({ ...base, status: "draft" })).toBe(false);
  });
  it("is false for a member who did not apply through Join", () => {
    expect(shouldSendWelcome({ ...base, applied_via_join_at: null })).toBe(false);
  });
  it("is false once welcomed", () => {
    expect(shouldSendWelcome({ ...base, join_welcomed_at: "2026-11-02T00:00:00Z" })).toBe(false);
  });
});
