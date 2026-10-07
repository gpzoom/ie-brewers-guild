import { describe, expect, it } from "vitest";
import { signVisitLink, verifyVisitLink, visitLinkExpiry } from "./visit-link-token";

const NOW = new Date("2026-10-07T18:00:00Z");
describe("visit links", () => {
  it("valid until the visit is over", async () => {
    const t = await signVisitLink({ eventId: "e1", hostId: "mars", action: "approve", expiresAt: new Date("2026-10-09T04:00:00Z") }, "k");
    expect(await verifyVisitLink(t, "k", NOW)).toEqual({ valid: true, eventId: "e1", hostId: "mars", action: "approve" });
    expect(await verifyVisitLink(t, "k", new Date("2026-10-09T05:00:00Z"))).toEqual({ valid: false, reason: "expired" });
    expect(await verifyVisitLink(t, "wrong", NOW)).toEqual({ valid: false, reason: "invalid" });
  });
  it("expiry: the end, else start + 2 hours, never more than 60 days out", () => {
    expect(visitLinkExpiry("2026-10-09T00:00:00Z", "2026-10-09T04:00:00Z", NOW).toISOString()).toBe("2026-10-09T04:00:00.000Z");
    expect(visitLinkExpiry("2026-10-09T00:00:00Z", null, NOW).toISOString()).toBe("2026-10-09T02:00:00.000Z");
    expect(visitLinkExpiry("2027-03-01T00:00:00Z", null, NOW).toISOString()).toBe("2026-12-06T18:00:00.000Z");
  });
});
