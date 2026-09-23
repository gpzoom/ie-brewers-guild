import { describe, expect, it } from "vitest";
import {
  IDLE_TIMEOUT_MS,
  isImpersonationExpired,
  shouldRecordAudit,
  signImpersonationState,
  verifyImpersonationCookie,
  type ImpersonationState,
} from "./impersonation-token";

const SECRET = "test-secret-do-not-use-in-real-life";

function makeState(overrides: Partial<ImpersonationState> = {}): ImpersonationState {
  return {
    actorUserId: "admin-1",
    memberId: "member-1",
    startedAt: 1_000,
    lastActivityAt: 1_000,
    ...overrides,
  };
}

describe("sign/verify round trip", () => {
  it("verifies a value it just signed", async () => {
    const state = makeState();
    const cookie = await signImpersonationState(state, SECRET);
    expect(await verifyImpersonationCookie(cookie, SECRET)).toEqual(state);
  });

  it("rejects a tampered payload", async () => {
    const cookie = await signImpersonationState(makeState(), SECRET);
    const [payload, signature] = cookie.split(".");
    const tampered = `${payload}x.${signature}`;
    expect(await verifyImpersonationCookie(tampered, SECRET)).toBeNull();
  });

  it("rejects a cookie signed with a different secret", async () => {
    const cookie = await signImpersonationState(makeState(), SECRET);
    expect(await verifyImpersonationCookie(cookie, "a-different-secret")).toBeNull();
  });

  it("rejects a malformed cookie", async () => {
    expect(await verifyImpersonationCookie("not-a-real-cookie", SECRET)).toBeNull();
    expect(await verifyImpersonationCookie("", SECRET)).toBeNull();
  });
});

describe("isImpersonationExpired", () => {
  it("is not expired right after the last activity", () => {
    const state = makeState({ lastActivityAt: 10_000 });
    expect(isImpersonationExpired(state, 10_000 + IDLE_TIMEOUT_MS - 1)).toBe(false);
  });

  it("is expired once the idle timeout has fully elapsed", () => {
    const state = makeState({ lastActivityAt: 10_000 });
    expect(isImpersonationExpired(state, 10_000 + IDLE_TIMEOUT_MS + 1)).toBe(true);
  });
});

describe("shouldRecordAudit", () => {
  it("is false with no impersonation state", () => {
    expect(shouldRecordAudit(null, "member-1")).toBe(false);
  });

  it("is true when the state's memberId matches the write's target", () => {
    expect(shouldRecordAudit(makeState({ memberId: "member-1" }), "member-1")).toBe(true);
  });

  it("is false when the state's memberId doesn't match", () => {
    expect(shouldRecordAudit(makeState({ memberId: "member-1" }), "member-2")).toBe(false);
  });
});
