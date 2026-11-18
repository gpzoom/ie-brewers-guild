/**
 * Loyalty offers waiting for the Guild (owner, 2026-11-18): a pulsing box on
 * Member alerts, the sidebar count, the pulsing Offers tab, and an email to
 * the Guild inbox on every submit. Worked out from the waiting offers
 * themselves, so it clears once each is approved or declined.
 */
export const OFFERS_REVIEW_PATH = "/guild/tap-card?tab=offers";

export function pendingOffersText(count: number): string {
  return count === 1
    ? "Tap Card: 1 loyalty offer is waiting for your approval."
    : `Tap Card: ${count} loyalty offers are waiting for your approval.`;
}

/** The Member alerts sidebar count: open member alerts plus waiting offers; null only when neither loaded. */
export function alertBadgeCount(openAlerts: number | null, pendingOffers: number | null): number | null {
  if (openAlerts === null && pendingOffers === null) return null;
  return (openAlerts ?? 0) + (pendingOffers ?? 0);
}
