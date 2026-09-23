import { describe, expect, it } from "vitest";
import { signHoursConfirmToken, verifyHoursConfirmToken } from "./confirm-token";

const SECRET = "test-secret-value";
const MEMBER_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("signHoursConfirmToken / verifyHoursConfirmToken", () => {
  it("round-trips a valid token", async () => {
    const token = await signHoursConfirmToken(MEMBER_ID, SECRET);
    expect(await verifyHoursConfirmToken(token, SECRET)).toEqual({ valid: true, memberId: MEMBER_ID });
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signHoursConfirmToken(MEMBER_ID, SECRET);
    expect((await verifyHoursConfirmToken(token, "wrong-secret")).valid).toBe(false);
  });

  it("rejects a tampered payload", async () => {
    const token = await signHoursConfirmToken(MEMBER_ID, SECRET);
    const [payload, signature] = token.split(".");
    expect((await verifyHoursConfirmToken(`${payload}x.${signature}`, SECRET)).valid).toBe(false);
  });

  it("rejects an expired token", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const token = await signHoursConfirmToken(MEMBER_ID, SECRET, now);
    const later = new Date("2026-03-01T00:00:00Z"); // more than 30 days later
    expect(await verifyHoursConfirmToken(token, SECRET, later)).toEqual({ valid: false, reason: "This link has expired." });
  });

  it("rejects a malformed token", async () => {
    expect((await verifyHoursConfirmToken("not-a-real-token", SECRET)).valid).toBe(false);
  });
});
