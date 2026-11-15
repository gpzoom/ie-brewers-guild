import { describe, expect, it } from "vitest";
import { DETAILS_NOTIFY_INTERVAL_MS, detailsNotifyCutoff, joinFinishKind, shouldNotifyDetails } from "./details-notify";

const now = new Date("2026-11-15T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();

describe("shouldNotifyDetails", () => {
  it("is true when the Guild has never been told", () => {
    expect(shouldNotifyDetails(null, now)).toBe(true);
  });

  it("is false within 24 hours of the last email", () => {
    expect(shouldNotifyDetails(hoursAgo(23), now)).toBe(false);
    expect(shouldNotifyDetails(hoursAgo(0), now)).toBe(false);
  });

  it("is true again after 24 hours", () => {
    expect(shouldNotifyDetails(hoursAgo(25), now)).toBe(true);
    expect(shouldNotifyDetails(hoursAgo(24), now)).toBe(true);
  });

  it("treats an unreadable timestamp as never notified", () => {
    expect(shouldNotifyDetails("not a date", now)).toBe(true);
  });
});

describe("detailsNotifyCutoff", () => {
  it("is exactly 24 hours before now", () => {
    expect(DETAILS_NOTIFY_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
    expect(detailsNotifyCutoff(now)).toBe(hoursAgo(24));
  });
});

describe("joinFinishKind (Review Focus 5)", () => {
  it("an applicant gets the form", () => {
    expect(joinFinishKind({ kind: "join-finish" })).toBe("form");
  });

  it("a declined applicant gets the isn't-active message, never the form", () => {
    expect(joinFinishKind({ kind: "inactive" })).toBe("inactive");
  });

  it("anyone else is not an applicant (sent to /portal)", () => {
    expect(joinFinishKind({ kind: "portal" })).toBe("not-applicant");
    expect(joinFinishKind({ kind: "wizard", step: "welcome" })).toBe("not-applicant");
    expect(joinFinishKind({ kind: "wizard", step: "basics" })).toBe("not-applicant");
  });
});
