import { describe, expect, it } from "vitest";
import { hashUploadToken } from "@/lib/media/upload-tokens";
import { claimScannerCore, type ClaimStore } from "@/lib/tap-card/claim-scanner";

type Row = { id: string; hash: string; revoked: boolean; memberName: string };

function memoryStore(rows: Row[]): ClaimStore {
  return {
    async byHash(hash) {
      const r = rows.find((x) => x.hash === hash);
      return r ? { id: r.id, revokedAt: r.revoked ? "2026-11-01" : null, memberName: r.memberName } : null;
    },
    async swapHash(id, oldHash, newHash) {
      const r = rows.find((x) => x.id === id && x.hash === oldHash);
      if (!r) return false;
      r.hash = newHash;
      return true;
    },
  };
}

async function deviceRow(token: string, revoked = false): Promise<Row> {
  return { id: "d1", hash: await hashUploadToken(token), revoked, memberName: "Sample Brewery" };
}

describe("claimScannerCore", () => {
  it("claims a fresh link and hands back a new device key", async () => {
    const rows = [await deviceRow("setup-token")];
    const result = await claimScannerCore(memoryStore(rows), "setup-token", "device-key");
    expect(result).toEqual({ ok: true, deviceKey: "device-key", deviceId: "d1", memberName: "Sample Brewery" });
    expect(rows[0].hash).toBe(await hashUploadToken("device-key"));
  });

  it("refuses the same link a second time", async () => {
    const store = memoryStore([await deviceRow("setup-token")]);
    await claimScannerCore(store, "setup-token", "device-key-1");
    expect(await claimScannerCore(store, "setup-token", "device-key-2")).toEqual({ ok: false });
  });

  it("refuses a turned-off device", async () => {
    expect(await claimScannerCore(memoryStore([await deviceRow("setup-token", true)]), "setup-token", "k")).toEqual({ ok: false });
  });

  it("refuses an unknown or empty token", async () => {
    const store = memoryStore([await deviceRow("setup-token")]);
    expect(await claimScannerCore(store, "nope", "k")).toEqual({ ok: false });
    expect(await claimScannerCore(store, "", "k")).toEqual({ ok: false });
  });

  it("refuses when another device claimed the link first", async () => {
    const rows = [await deviceRow("setup-token")];
    const store = memoryStore(rows);
    const racing: ClaimStore = {
      byHash: store.byHash,
      async swapHash(id, oldHash, newHash) {
        await store.swapHash(id, oldHash, "someone-else");
        return store.swapHash(id, oldHash, newHash);
      },
    };
    expect(await claimScannerCore(racing, "setup-token", "k")).toEqual({ ok: false });
  });
});
