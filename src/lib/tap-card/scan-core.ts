import { scanIsFresh, type PendingScan, type StaffQrView } from "@/lib/tap-card/staff-qr";

/**
 * The tap after a staff QR scan (spec 2026-11-24): the scan must be fresh,
 * be the one on the screen that was tapped (`shownAt`: an old tab can't
 * confirm a newer scan), its code must still work for the same member, and
 * it's used up once.
 */
export type ScanStore = {
  pending(): Promise<PendingScan | null>;
  codeState(staffCode: string): Promise<{ memberId: string; view: StaffQrView } | null>;
  claim(scan: PendingScan): Promise<boolean>;
};

export type ScanOutcome = { kind: "ok" | "turned-off"; scan: PendingScan } | { kind: "closed" } | { kind: "scan-again" };

export async function confirmScanCore(store: ScanStore, now: Date, shownAt: string): Promise<ScanOutcome> {
  const scan = await store.pending();
  if (!scan || scan.at !== shownAt || !scanIsFresh(scan.at, now)) return { kind: "scan-again" };
  const code = await store.codeState(scan.staffCode);
  if (!code || code.memberId !== scan.memberId) return { kind: "scan-again" };
  if (code.view.kind === "turned-off") return { kind: "turned-off", scan };
  if (code.view.kind === "closed") return { kind: "closed" };
  if (code.view.kind !== "note-scan") return { kind: "scan-again" };
  return (await store.claim(scan)) ? { kind: "ok", scan } : { kind: "scan-again" };
}
