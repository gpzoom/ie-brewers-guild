import type { ScannerState } from "@/lib/tap-card/tap-card-auth";

/**
 * What /p/<code> shows. The same link is on every card's chip and QR code;
 * who opened it decides the screen:
 *   - a working bar device → activate a new card, or the check-in screen;
 *   - a bar device whose brewery is unpublished/off the trail → why it can't record;
 *   - the card's own holder → their card page;
 *   - anyone else → activate a new card, or "this card is active".
 * An unknown code says the same thing to everyone.
 */
export type CardViewKind =
  | "unknown"
  | "staff-blocked"
  | "staff-activate"
  | "staff-check-in"
  | "customer-activate"
  | "customer-active"
  | "customer-own";

export function pickCardViewKind(
  device: ScannerState,
  card: { holderId: string | null } | null,
  sessionHolderId: string | null,
): CardViewKind {
  if (!card) return "unknown";
  if (device.kind === "blocked") return "staff-blocked";
  if (device.kind === "ok") return card.holderId ? "staff-check-in" : "staff-activate";
  if (!card.holderId) return "customer-activate";
  return sessionHolderId === card.holderId ? "customer-own" : "customer-active";
}

export type RedemptionView = { available: true } | { available: false; redeemedOn: string };

export type CardView =
  | { view: "unknown" }
  | { view: "throttled"; message: string }
  | { view: "staff-blocked"; memberName: string }
  | { view: "staff-activate"; code: string; memberName: string }
  | {
      view: "staff-check-in";
      code: string;
      memberName: string;
      firstName: string;
      offer: string;
      redemption: RedemptionView;
      visitedToday: boolean;
    }
  | { view: "customer-activate"; code: string }
  | { view: "customer-active" }
  | { view: "customer-own" };

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
