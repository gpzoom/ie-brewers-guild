import { describe, expect, it } from "vitest";
import { OFFERS_REVIEW_PATH, alertBadgeCount, pendingOffersText } from "@/lib/tap-card/offer-alerts";

describe("pendingOffersText", () => {
  it("counts one or many", () => {
    expect(pendingOffersText(1)).toBe("Scan Pass: 1 loyalty offer is waiting for your approval.");
    expect(pendingOffersText(2)).toBe("Scan Pass: 2 loyalty offers are waiting for your approval.");
  });
  it("links to the Offers tab", () => {
    expect(OFFERS_REVIEW_PATH).toBe("/guild/scan-pass?tab=offers");
  });
});

describe("alertBadgeCount", () => {
  it("adds waiting offers to open member alerts", () => {
    expect(alertBadgeCount(3, 2)).toBe(5);
    expect(alertBadgeCount(0, 0)).toBe(0);
  });
  it("still shows one count when the other failed to load", () => {
    expect(alertBadgeCount(null, 2)).toBe(2);
    expect(alertBadgeCount(3, null)).toBe(3);
    expect(alertBadgeCount(null, null)).toBeNull();
  });
});
