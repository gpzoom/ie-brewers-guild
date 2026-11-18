import { describe, expect, it } from "vitest";
import {
  PENDING_MINUTES,
  decideStaffQrView,
  isStaffQrToken,
  memberTakesCheckIns,
  parsePendingChoice,
  sessionNeedsRenewal,
  staffQrUrl,
} from "@/lib/tap-card/staff-qr";

const TOKEN = "a".repeat(40) + "_-9";
const now = new Date("2026-11-18T20:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000).toISOString();

describe("staffQrUrl / isStaffQrToken", () => {
  it("is the site's /s/ link", () => {
    expect(staffQrUrl("https://example.org", TOKEN)).toBe(`https://example.org/s/${TOKEN}`);
  });
  it("takes only a 43-character base64url token", () => {
    expect(isStaffQrToken(TOKEN)).toBe(true);
    for (const bad of ["", "abc", TOKEN + "x", TOKEN.slice(0, 42) + "/", 42]) expect(isStaffQrToken(bad)).toBe(false);
  });
});

describe("parsePendingChoice", () => {
  it("keeps only the three shapes a plate can send", () => {
    expect(parsePendingChoice({ kind: "none" })).toEqual({ kind: "none" });
    expect(parsePendingChoice({ kind: "trail" })).toEqual({ kind: "trail" });
    expect(parsePendingChoice({ kind: "member", id: "r1", extra: 1 })).toEqual({ kind: "member", id: "r1" });
    for (const bad of [null, "none", { kind: "member" }, { kind: "member", id: "" }, { kind: "other" }]) expect(parsePendingChoice(bad)).toBeNull();
  });
});

describe("decideStaffQrView", () => {
  const pending = { memberId: "m1", plateCode: "ABCD2345", choice: { kind: "none" } as const, at: minutesAgo(2) };

  it("doesn't know a token that matches no plate", () => {
    expect(decideStaffQrView({ qrMemberId: null, signedIn: true, pending, now })).toEqual({ kind: "unknown" });
  });
  it("sends a signed-out phone back to the plate", () => {
    expect(decideStaffQrView({ qrMemberId: "m1", signedIn: false, pending: null, now })).toEqual({ kind: "scan-plate-first" });
  });
  it("needs a plate scan first", () => {
    expect(decideStaffQrView({ qrMemberId: "m1", signedIn: true, pending: null, now })).toEqual({ kind: "scan-plate-first" });
  });
  it(`needs the plate scan within ${PENDING_MINUTES} minutes`, () => {
    const stale = { ...pending, at: minutesAgo(PENDING_MINUTES + 1) };
    expect(decideStaffQrView({ qrMemberId: "m1", signedIn: true, pending: stale, now })).toEqual({ kind: "scan-plate-first" });
  });
  it("refuses another brewery's bartender QR", () => {
    expect(decideStaffQrView({ qrMemberId: "m2", signedIn: true, pending, now })).toEqual({ kind: "wrong-brewery" });
  });
  it("records a plain check-in straight away", () => {
    expect(decideStaffQrView({ qrMemberId: "m1", signedIn: true, pending, now })).toEqual({ kind: "check-in", plateCode: "ABCD2345" });
  });
  it("asks before using a reward", () => {
    const reward = { ...pending, choice: { kind: "member", id: "r1" } as const };
    expect(decideStaffQrView({ qrMemberId: "m1", signedIn: true, pending: reward, now })).toEqual({
      kind: "confirm",
      plateCode: "ABCD2345",
      choice: { kind: "member", id: "r1" },
    });
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
  it("takes published trail producers anywhere", () => {
    expect(memberTakesCheckIns({ status: "published", memberType: "producer", trailEligible: true }, false)).toBe(true);
  });
  it("takes a draft trail producer on the staging site only", () => {
    const draft = { status: "draft", memberType: "producer", trailEligible: true };
    expect(memberTakesCheckIns(draft, true)).toBe(true);
    expect(memberTakesCheckIns(draft, false)).toBe(false);
  });
  it("never takes members off the trail, other member types, or archived members", () => {
    expect(memberTakesCheckIns({ status: "published", memberType: "producer", trailEligible: false }, true)).toBe(false);
    expect(memberTakesCheckIns({ status: "published", memberType: "affiliate", trailEligible: true }, true)).toBe(false);
    expect(memberTakesCheckIns({ status: "archived", memberType: "producer", trailEligible: true }, true)).toBe(false);
  });
});
