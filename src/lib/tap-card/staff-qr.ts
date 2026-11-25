import { OFFER_SLOTS, type OfferSlot } from "@/lib/tap-card/loyalty";
import type { RewardChoice } from "@/lib/tap-card/bar-core";

/**
 * The staff QR (spec 2026-11-24-staff-qr-one-scan-design.md): a secret QR
 * kept behind the counter, holding `/s/<token>`. Scanning it only notes the
 * scan on that phone's session; the customer's tap within SCAN_MINUTES
 * records the visit.
 */
export const SCAN_MINUTES = 5;

export const STAFF_QR_TURNED_OFF = "This staff code no longer works. Ask the staff for the current one.";

export type PendingChoice = { kind: "none" } | RewardChoice;
export type PendingScan = { sessionId: string; memberId: string; staffCode: string; at: string };

export function staffQrUrl(siteUrl: string, token: string): string {
  return `${siteUrl}/s/${token}`;
}

export function isStaffQrToken(raw: unknown): raw is string {
  return typeof raw === "string" && /^[0-9A-HJKMNP-TV-Z]{8}$/.test(raw);
}

export function parsePendingChoice(raw: unknown): PendingChoice | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { kind?: unknown; id?: unknown; slot?: unknown };
  if (r.kind === "none" || r.kind === "trail") return { kind: r.kind };
  if (r.kind === "earn" && typeof r.slot === "string" && (OFFER_SLOTS as readonly string[]).includes(r.slot)) {
    return { kind: "earn", slot: r.slot as OfferSlot };
  }
  if (r.kind === "member" && typeof r.id === "string" && r.id) return { kind: "member", id: r.id };
  return null;
}

export type StaffQrView = { kind: "unknown" | "closed" | "turned-off" | "sign-in" | "note-scan" };

/** A turned-off code is told apart from a closed plate, unless the member takes no check-ins at all. */
export function decideStaffQrView(i: {
  qrMemberId: string | null;
  /** memberTakesCheckIns */
  takesCheckIns: boolean;
  /** Takes check-ins and has a 4-digit code. */
  plateOpen: boolean;
  qrActive: boolean;
  signedIn: boolean;
}): StaffQrView {
  if (!i.qrMemberId) return { kind: "unknown" };
  if (!i.takesCheckIns) return { kind: "closed" };
  if (!i.qrActive) return { kind: "turned-off" };
  if (!i.plateOpen) return { kind: "closed" };
  return { kind: i.signedIn ? "note-scan" : "sign-in" };
}

/** Within SCAN_MINUTES of the scan. A few seconds "in the future" is two servers' clocks. */
export function scanIsFresh(at: string, now: Date): boolean {
  const age = now.getTime() - Date.parse(at);
  return age >= -5000 && age <= SCAN_MINUTES * 60 * 1000;
}

/** Card sessions are renewed when used, at most once a day. */
export function sessionNeedsRenewal(expiresAt: string, now: Date, maxAgeMs: number): boolean {
  return new Date(expiresAt).getTime() - now.getTime() < maxAgeMs - 24 * 60 * 60 * 1000;
}

/**
 * Whether a Guild member takes plate and bar-device check-ins (universal
 * card, spec 2026-11-19): any published member, of any type -- or, on the
 * staging site only, a draft one, so test members work without going public.
 */
export function memberTakesCheckIns(m: { status: string; memberType?: string; trailEligible?: boolean }, stagingSite: boolean): boolean {
  return m.status === "published" || (stagingSite && m.status === "draft");
}

/** A Beer Trail stop: a producer on the trail. Only trail stops give the Beer Trail offer and count toward milestones. */
export function isTrailStop(m: { memberType: string; trailEligible: boolean }): boolean {
  return m.memberType === "producer" && m.trailEligible;
}
