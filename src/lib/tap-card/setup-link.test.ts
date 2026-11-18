import { describe, expect, it } from "vitest";
import { hashUploadToken } from "@/lib/media/upload-tokens";
import { newSetupLinkCore, type SetupLinkStore } from "@/lib/tap-card/setup-link";

type Row = { id: string; memberId: string; hash: string; revokedAt: string | null; lastUsedAt: string | null };

function memoryStore(rows: Row[]): SetupLinkStore {
  return {
    async find(deviceId, memberId) {
      const r = rows.find((x) => x.id === deviceId && x.memberId === memberId);
      return r ? { revokedAt: r.revokedAt, lastUsedAt: r.lastUsedAt } : null;
    },
    async replaceHashIfNotSetUp(deviceId, newHash) {
      const r = rows.find((x) => x.id === deviceId && !x.revokedAt && !x.lastUsedAt);
      if (!r) return false;
      r.hash = newHash;
      return true;
    },
  };
}

const fresh = (): Row => ({ id: "d1", memberId: "m1", hash: "old", revokedAt: null, lastUsedAt: null });

describe("newSetupLinkCore", () => {
  it("gives a device that isn't set up yet a fresh link (the old one stops working)", async () => {
    const rows = [fresh()];
    expect(await newSetupLinkCore(memoryStore(rows), "m1", "d1", "new-token")).toEqual({ ok: true, token: "new-token" });
    expect(rows[0].hash).toBe(await hashUploadToken("new-token"));
  });

  it("refuses a device that is already set up", async () => {
    const rows = [{ ...fresh(), lastUsedAt: "2026-11-17T20:00:00Z" }];
    expect(await newSetupLinkCore(memoryStore(rows), "m1", "d1", "t")).toEqual({ ok: false, reason: "already-set-up" });
    expect(rows[0].hash).toBe("old");
  });

  it("refuses a turned-off device or another brewery's device", async () => {
    expect(await newSetupLinkCore(memoryStore([{ ...fresh(), revokedAt: "2026-11-17" }]), "m1", "d1", "t")).toEqual({
      ok: false,
      reason: "gone",
    });
    expect(await newSetupLinkCore(memoryStore([fresh()]), "m2", "d1", "t")).toEqual({ ok: false, reason: "gone" });
  });

  it("refuses when the device was set up in the meantime", async () => {
    const rows = [fresh()];
    const store = memoryStore(rows);
    const racing: SetupLinkStore = {
      find: store.find,
      async replaceHashIfNotSetUp(id, hash) {
        rows[0].lastUsedAt = "2026-11-17T20:00:00Z";
        return store.replaceHashIfNotSetUp(id, hash);
      },
    };
    expect(await newSetupLinkCore(racing, "m1", "d1", "t")).toEqual({ ok: false, reason: "already-set-up" });
  });
});
