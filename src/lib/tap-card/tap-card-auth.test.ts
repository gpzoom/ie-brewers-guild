import { describe, expect, it } from "vitest";
import { hashUploadToken } from "@/lib/media/upload-tokens";
import { resolveHolderSession, resolveScannerDevice, type ScannerDeviceRecord } from "./tap-card-auth";

const device: ScannerDeviceRecord = {
  id: "d1",
  memberId: "m1",
  memberName: "Sample Brewery",
  label: "Bar iPad",
  revokedAt: null,
  memberPublished: true,
  trailEligible: true,
};

function deviceStore(record: ScannerDeviceRecord | null, expectedHash: string) {
  return { byHash: async (hash: string) => (hash === expectedHash ? record : null) };
}

describe("resolveScannerDevice", () => {
  it("no cookie is no device", async () => {
    expect(await resolveScannerDevice(deviceStore(device, "x"), undefined)).toEqual({ kind: "none" });
  });

  it("looks the device up by the token's hash", async () => {
    const hash = await hashUploadToken("raw-token");
    expect(await resolveScannerDevice(deviceStore(device, hash), "raw-token")).toEqual({
      kind: "ok",
      device: { id: "d1", memberId: "m1", memberName: "Sample Brewery", label: "Bar iPad" },
    });
    expect(await resolveScannerDevice(deviceStore(device, hash), "other-token")).toEqual({ kind: "none" });
  });

  it("a revoked device is no device", async () => {
    const hash = await hashUploadToken("raw-token");
    expect(await resolveScannerDevice(deviceStore({ ...device, revokedAt: "2026-11-01T00:00:00Z" }, hash), "raw-token")).toEqual({
      kind: "none",
    });
  });

  it("an unpublished member is blocked; a member off the trail still takes loyalty check-ins", async () => {
    const hash = await hashUploadToken("raw-token");
    const expected = { kind: "blocked", device: { id: "d1", memberId: "m1", memberName: "Sample Brewery", label: "Bar iPad" } };
    expect(await resolveScannerDevice(deviceStore({ ...device, memberPublished: false }, hash), "raw-token")).toEqual(expected);
    expect((await resolveScannerDevice(deviceStore({ ...device, trailEligible: false }, hash), "raw-token")).kind).toBe("ok");
  });
});

describe("resolveHolderSession", () => {
  const now = new Date("2026-11-20T12:00:00Z");

  it("returns the holder for a live session", async () => {
    const hash = await hashUploadToken("session");
    const store = { byHash: async (h: string) => (h === hash ? { holderId: "h1", expiresAt: "2026-12-01T00:00:00Z" } : null) };
    expect(await resolveHolderSession(store, "session", now)).toBe("h1");
  });

  it("an expired session, unknown token or no cookie is nobody", async () => {
    const hash = await hashUploadToken("session");
    const store = { byHash: async (h: string) => (h === hash ? { holderId: "h1", expiresAt: "2026-11-01T00:00:00Z" } : null) };
    expect(await resolveHolderSession(store, "session", now)).toBeNull();
    expect(await resolveHolderSession(store, "nope", now)).toBeNull();
    expect(await resolveHolderSession(store, undefined, now)).toBeNull();
  });
});
