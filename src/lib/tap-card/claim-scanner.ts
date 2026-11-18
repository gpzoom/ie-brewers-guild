import { hashUploadToken } from "@/lib/media/upload-tokens";

/**
 * A bar-device setup link works once. Claiming it swaps the stored hash for a
 * new device key (kept in the bar device's cookie), so the link -- which may
 * be printed as a QR code -- is dead afterwards. The swap only lands if the
 * hash is still the link's, so two devices racing on one link can't both win.
 * No database change needed: scanner_devices.token_hash just moves on.
 */
export type ClaimStore = {
  byHash(hash: string): Promise<{ id: string; revokedAt: string | null; memberName: string } | null>;
  swapHash(id: string, oldHash: string, newHash: string): Promise<boolean>;
};

export type ClaimResult = { ok: false } | { ok: true; deviceKey: string; deviceId: string; memberName: string };

export async function claimScannerCore(store: ClaimStore, setupToken: string, newDeviceKey: string): Promise<ClaimResult> {
  if (!setupToken || setupToken.length > 100) return { ok: false };
  const oldHash = await hashUploadToken(setupToken);
  const device = await store.byHash(oldHash);
  if (!device || device.revokedAt) return { ok: false };
  const swapped = await store.swapHash(device.id, oldHash, await hashUploadToken(newDeviceKey));
  if (!swapped) return { ok: false };
  return { ok: true, deviceKey: newDeviceKey, deviceId: device.id, memberName: device.memberName };
}
