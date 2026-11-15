import { describe, expect, it } from "vitest";
import { approvalPatch, isUnwelcomedJoinApplicant, rosterShowsApprove, shouldSendWelcome } from "./approval";

const now = new Date("2026-11-15T12:00:00.000Z");

describe("approvalPatch", () => {
  it("approving an applicant moves them to Draft", () => {
    expect(approvalPatch({ status: "applied" }, "u1", now)).toEqual({
      status: "draft",
      approved_at: "2026-11-15T12:00:00.000Z",
      approved_by_user_id: "u1",
    });
  });

  it.each(["draft", "published", "declined", "suspended"] as const)("%s (not from Join) still goes to published", (status) => {
    expect(approvalPatch({ status }, "u1", now).status).toBe("published");
    expect(approvalPatch({ status, applied_via_join_at: null, join_welcomed_at: null }, "u1", now).status).toBe(
      "published",
    );
  });

  it.each(["applied", "draft", "published", "declined", "suspended"] as const)(
    "an unwelcomed Join applicant in %s always goes to Draft, never published",
    (status) => {
      expect(
        approvalPatch({ status, applied_via_join_at: "2026-11-01T00:00:00Z", join_welcomed_at: null }, "u1", now).status,
      ).toBe("draft");
    },
  );

  it("a Join member who was already welcomed publishes as before", () => {
    expect(
      approvalPatch(
        { status: "suspended", applied_via_join_at: "2026-11-01T00:00:00Z", join_welcomed_at: "2026-11-02T00:00:00Z" },
        "u1",
        now,
      ).status,
    ).toBe("published");
  });
});

describe("rosterShowsApprove", () => {
  const join = { applied_via_join_at: "2026-11-01T00:00:00Z", join_welcomed_at: null };
  it("hides Approve on an unwelcomed Join applicant's Draft", () => {
    expect(rosterShowsApprove({ status: "draft", ...join })).toBe(false);
  });
  it("shows Approve on an applied Join applicant", () => {
    expect(rosterShowsApprove({ status: "applied", ...join })).toBe(true);
  });
  it("shows Approve on a non-Join Draft and on a welcomed Join Draft", () => {
    expect(rosterShowsApprove({ status: "draft", applied_via_join_at: null, join_welcomed_at: null })).toBe(true);
    expect(rosterShowsApprove({ status: "draft", applied_via_join_at: "x", join_welcomed_at: "y" })).toBe(true);
  });
  it("never shows Approve on a published row", () => {
    expect(rosterShowsApprove({ status: "published" })).toBe(false);
  });
});

describe("isUnwelcomedJoinApplicant", () => {
  it("is true only when applied through Join and never welcomed", () => {
    expect(isUnwelcomedJoinApplicant({ status: "draft", applied_via_join_at: "x", join_welcomed_at: null })).toBe(true);
    expect(isUnwelcomedJoinApplicant({ status: "draft", applied_via_join_at: "x", join_welcomed_at: "y" })).toBe(false);
    expect(isUnwelcomedJoinApplicant({ status: "draft", applied_via_join_at: null, join_welcomed_at: null })).toBe(false);
    expect(isUnwelcomedJoinApplicant({ status: "draft" })).toBe(false);
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
