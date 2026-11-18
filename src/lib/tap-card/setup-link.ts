import { hashUploadToken } from "@/lib/media/upload-tokens";

/**
 * "Show setup code" on a bar device that isn't set up yet. The raw link is
 * never stored, so it can't be shown again; instead the device gets a fresh
 * link and the old one stops working. A device counts as set up once its
 * link is claimed (claiming stamps last_used_at), and then this is refused --
 * the replace only lands while the device is still not set up.
 */
export type SetupLinkStore = {
  find(deviceId: string, memberId: string): Promise<{ revokedAt: string | null; lastUsedAt: string | null } | null>;
  replaceHashIfNotSetUp(deviceId: string, newHash: string): Promise<boolean>;
};

export type SetupLinkResult = { ok: true; token: string } | { ok: false; reason: "gone" | "already-set-up" };

export async function newSetupLinkCore(
  store: SetupLinkStore,
  memberId: string,
  deviceId: string,
  newToken: string,
): Promise<SetupLinkResult> {
  const device = await store.find(deviceId, memberId);
  if (!device || device.revokedAt) return { ok: false, reason: "gone" };
  if (device.lastUsedAt) return { ok: false, reason: "already-set-up" };
  const replaced = await store.replaceHashIfNotSetUp(deviceId, await hashUploadToken(newToken));
  return replaced ? { ok: true, token: newToken } : { ok: false, reason: "already-set-up" };
}
