import { describe, expect, it } from "vitest";
import { signHoursConfirmToken } from "../hours/confirm-token";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe-token";

const SECRET = "test-secret";

describe("unsubscribe token", () => {
  it("round-trips a user id", async () => {
    const token = await signUnsubscribeToken("user-123", SECRET);
    expect(await verifyUnsubscribeToken(token, SECRET)).toEqual({ valid: true, userId: "user-123" });
  });

  it("rejects a tampered token", async () => {
    const token = await signUnsubscribeToken("user-123", SECRET);
    const [, sig] = token.split(".");
    const forgedPayload = btoa("unsubscribe:user-999").replace(/=+$/, "");
    expect(await verifyUnsubscribeToken(`${forgedPayload}.${sig}`, SECRET)).toEqual({ valid: false });
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signUnsubscribeToken("user-123", "other");
    expect(await verifyUnsubscribeToken(token, SECRET)).toEqual({ valid: false });
  });

  it("rejects an hours token signed with the same secret", async () => {
    const hours = await signHoursConfirmToken("user-123", SECRET);
    expect(await verifyUnsubscribeToken(hours, SECRET)).toEqual({ valid: false });
  });

  it("returns invalid for malformed input without throwing", async () => {
    for (const bad of ["", "nodot", "a.b.c", "!!!.???", "abc."]) {
      expect(await verifyUnsubscribeToken(bad, SECRET)).toEqual({ valid: false });
    }
  });
});
