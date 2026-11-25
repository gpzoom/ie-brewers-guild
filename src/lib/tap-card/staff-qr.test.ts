import { describe, expect, it } from "vitest";
import {
  SCAN_MINUTES,
  STAFF_QR_TURNED_OFF,
  decideStaffQrView,
  isStaffQrToken,
  isTrailStop,
  memberTakesCheckIns,
  parsePendingChoice,
  scanIsFresh,
  sessionNeedsRenewal,
  staffQrUrl,
} from "@/lib/tap-card/staff-qr";

const TOKEN = "ABCD1234";
const OLD_LONG_TOKEN = "a".repeat(40) + "_-9";
const now = new Date("2026-11-18T20:00:00Z");

describe("staffQrUrl / isStaffQrToken", () => {
  it("is the site's /s/ link", () => {
    expect(staffQrUrl("https://example.org", TOKEN)).toBe(`https://example.org/s/${TOKEN}`);
  });
  it("takes only an 8-character code in the plate alphabet", () => {
    expect(isStaffQrToken(TOKEN)).toBe(true);
    for (const bad of ["", "abc", TOKEN + "X", "abcd1234", "ABCD123I", OLD_LONG_TOKEN, 42]) expect(isStaffQrToken(bad)).toBe(false);
  });
});

describe("parsePendingChoice", () => {
  it("keeps only the three shapes a plate can send", () => {
    expect(parsePendingChoice({ kind: "none" })).toEqual({ kind: "none" });
    expect(parsePendingChoice({ kind: "earn", slot: "step1" })).toEqual({ kind: "earn", slot: "step1" });
    expect(parsePendingChoice({ kind: "earn", slot: "nope" })).toBeNull();
    expect(parsePendingChoice({ kind: "trail" })).toEqual({ kind: "trail" });
    expect(parsePendingChoice({ kind: "member", id: "r1", extra: 1 })).toEqual({ kind: "member", id: "r1" });
    for (const bad of [null, "none", { kind: "member" }, { kind: "member", id: "" }, { kind: "other" }]) expect(parsePendingChoice(bad)).toBeNull();
  });
});

describe("decideStaffQrView", () => {
  const on = { qrMemberId: "m1", takesCheckIns: true, plateOpen: true, qrActive: true, signedIn: true };
  it.each([
    [{ qrMemberId: null }, "unknown"],
    [{ takesCheckIns: false, plateOpen: false }, "closed"],
    [{ takesCheckIns: false, plateOpen: false, qrActive: false }, "closed"],
    [{ qrActive: false }, "turned-off"],
    [{ qrActive: false, signedIn: false }, "turned-off"],
    [{ qrActive: false, plateOpen: false }, "turned-off"],
    [{ plateOpen: false }, "closed"],
    [{ signedIn: false }, "sign-in"],
    [{}, "note-scan"],
  ])("%j: %s", (over, kind) => {
    expect(decideStaffQrView({ ...on, ...over })).toEqual({ kind });
  });
});

describe("scanIsFresh", () => {
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  it("lasts 5 minutes", () => {
    expect(SCAN_MINUTES).toBe(5);
    expect(scanIsFresh(ago(299_000), now)).toBe(true);
    expect(scanIsFresh(ago(300_000), now)).toBe(true);
    expect(scanIsFresh(ago(301_000), now)).toBe(false);
  });
  it("refuses a future or broken time", () => {
    expect(scanIsFresh(ago(-10_000), now)).toBe(false);
    expect(scanIsFresh("nope", now)).toBe(false);
  });
});

describe("sessionNeedsRenewal", () => {
  const day = 24 * 60 * 60 * 1000;
  const maxAgeMs = 400 * day;
  it("renews a session used more than a day after it was last set", () => {
    expect(sessionNeedsRenewal(new Date(now.getTime() + 300 * day).toISOString(), now, maxAgeMs)).toBe(true);
  });
  it("leaves a session renewed within the last day", () => {
    expect(sessionNeedsRenewal(new Date(now.getTime() + 399.5 * day).toISOString(), now, maxAgeMs)).toBe(false);
  });
});

describe("memberTakesCheckIns", () => {
  it("takes every published Guild member, of any type (universal card)", () => {
    for (const memberType of ["producer", "mobile", "allied"]) {
      expect(memberTakesCheckIns({ status: "published", memberType, trailEligible: false }, false)).toBe(true);
    }
  });
  it("takes a draft member on the staging site only", () => {
    const draft = { status: "draft", memberType: "allied", trailEligible: false };
    expect(memberTakesCheckIns(draft, true)).toBe(true);
    expect(memberTakesCheckIns(draft, false)).toBe(false);
  });
  it("never takes archived or suspended members", () => {
    expect(memberTakesCheckIns({ status: "archived", memberType: "producer", trailEligible: true }, true)).toBe(false);
    expect(memberTakesCheckIns({ status: "suspended", memberType: "producer", trailEligible: true }, true)).toBe(false);
  });
});

describe("isTrailStop", () => {
  it("is a producer on the trail only", () => {
    expect(isTrailStop({ memberType: "producer", trailEligible: true })).toBe(true);
    expect(isTrailStop({ memberType: "producer", trailEligible: false })).toBe(false);
    expect(isTrailStop({ memberType: "allied", trailEligible: true })).toBe(false);
    expect(isTrailStop({ memberType: "mobile", trailEligible: true })).toBe(false);
  });
});
