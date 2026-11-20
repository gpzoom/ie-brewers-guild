import { hashUploadToken } from "@/lib/media/upload-tokens";

/**
 * Who is looking at a card page. Two HttpOnly cookies hold raw random
 * tokens; only their SHA-256 hashes are stored (the upload-token pattern).
 *
 *  - Scanner device (brewery staff): created on the brewery's Portal/Admin
 *    "Scan Pass" screen, claimed once on the bar phone or tablet. A device
 *    whose brewery is unpublished or off the trail is "blocked": it's still
 *    recognized (so staff see why) but can't record anything.
 *  - Holder session (customer): started by activating a card or by the
 *    emailed sign-in link.
 */
export type ScannerDevice = { id: string; memberId: string; memberName: string; label: string };
export type ScannerDeviceRecord = ScannerDevice & {
  revokedAt: string | null;
  memberPublished: boolean;
  trailEligible: boolean;
};
export type ScannerState = { kind: "none" } | { kind: "blocked"; device: ScannerDevice } | { kind: "ok"; device: ScannerDevice };

export async function resolveScannerDevice(
  store: { byHash(hash: string): Promise<ScannerDeviceRecord | null> },
  rawToken: string | undefined,
): Promise<ScannerState> {
  if (!rawToken) return { kind: "none" };
  const record = await store.byHash(await hashUploadToken(rawToken));
  if (!record || record.revokedAt) return { kind: "none" };
  const device: ScannerDevice = {
    id: record.id,
    memberId: record.memberId,
    memberName: record.memberName,
    label: record.label,
  };
  // Universal card: any published member takes check-ins; the trail only decides the Beer Trail offer.
  return record.memberPublished ? { kind: "ok", device } : { kind: "blocked", device };
}

export async function resolveHolderSession(
  store: { byHash(hash: string): Promise<{ holderId: string; expiresAt: string } | null> },
  rawToken: string | undefined,
  now: Date,
): Promise<string | null> {
  if (!rawToken) return null;
  const session = await store.byHash(await hashUploadToken(rawToken));
  if (!session || new Date(session.expiresAt).getTime() <= now.getTime()) return null;
  return session.holderId;
}
