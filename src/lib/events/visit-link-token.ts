import { signToken, verifyToken } from "@/lib/crypto/signed-token";

/** The email buttons' signed links (spec, "The email buttons"): which visit, which taproom, which action, until when. */
export type VisitAction = "approve" | "decline" | "hide";
const ACTIONS: readonly VisitAction[] = ["approve", "decline", "hide"];
const MAX_MS = 60 * 24 * 3600 * 1000;

export function visitLinkExpiry(startsAt: string, endsAt: string | null, now: Date): Date {
  const end = endsAt ? new Date(endsAt).getTime() : new Date(startsAt).getTime() + 2 * 3600 * 1000;
  return new Date(Math.min(end, now.getTime() + MAX_MS));
}

export function signVisitLink(p: { eventId: string; hostId: string; action: VisitAction; expiresAt: Date }, secret: string): Promise<string> {
  return signToken(`${p.eventId}.${p.hostId}.${p.action}.${p.expiresAt.getTime()}`, secret);
}

export async function verifyVisitLink(
  token: string,
  secret: string,
  now: Date = new Date(),
): Promise<{ valid: true; eventId: string; hostId: string; action: VisitAction } | { valid: false; reason: "invalid" | "expired" }> {
  const payload = await verifyToken(token, secret);
  const [eventId, hostId, action, expires] = payload?.split(".") ?? [];
  if (!eventId || !hostId || !ACTIONS.includes(action as VisitAction) || !Number.isFinite(Number(expires))) {
    return { valid: false, reason: "invalid" };
  }
  if (Number(expires) <= now.getTime()) return { valid: false, reason: "expired" };
  return { valid: true, eventId, hostId, action: action as VisitAction };
}
