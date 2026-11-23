import { OFFER_SLOTS, type OfferSlot } from "@/lib/tap-card/loyalty";
import type { RewardChoice } from "@/lib/tap-card/bar-core";

/**
 * The staff QR (spec 2026-11-18-tap-card-bartender-qr-design.md): a
 * brewery's second, secret QR kept behind the counter, holding `/s/<token>`.
 * The customer picks at the counter plate, then scans this to confirm --
 * nothing is recorded by either scan alone.
 */
export const PENDING_MINUTES = 10;

export const STAFF_QR_TURNED_OFF = "This staff code no longer works. Ask the staff for the current one.";

export type PendingChoice = { kind: "none" } | RewardChoice;
export type Pending = { memberId: string; plateCode: string; choice: PendingChoice; at: string };

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

export type StaffQrView =
  | { kind: "unknown" }
  | { kind: "closed" }
  | { kind: "turned-off" }
  | { kind: "scan-plate-first" }
  | { kind: "wrong-brewery" }
  | { kind: "check-in"; plateCode: string }
  | { kind: "confirm"; plateCode: string; choice: RewardChoice };

/** A turned-off code is told apart from a closed plate, unless the member takes no check-ins at all. */
export function decideStaffQrView(i: {
  qrMemberId: string | null;
  /** memberTakesCheckIns */
  takesCheckIns: boolean;
  /** Takes check-ins and has a 4-digit code. */
  plateOpen: boolean;
  qrActive: boolean;
  signedIn: boolean;
  pending: Pending | null;
  now: Date;
}): StaffQrView {
  if (!i.qrMemberId) return { kind: "unknown" };
  if (!i.takesCheckIns) return { kind: "closed" };
  if (!i.qrActive) return { kind: "turned-off" };
  if (!i.plateOpen) return { kind: "closed" };
  const p = i.pending;
  if (!i.signedIn || !p || i.now.getTime() - new Date(p.at).getTime() > PENDING_MINUTES * 60 * 1000) return { kind: "scan-plate-first" };
  if (p.memberId !== i.qrMemberId) return { kind: "wrong-brewery" };
  return p.choice.kind === "none" ? { kind: "check-in", plateCode: p.plateCode } : { kind: "confirm", plateCode: p.plateCode, choice: p.choice };
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
