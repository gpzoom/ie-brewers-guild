import { describe, expect, it } from "vitest";
import { monthlyCommission } from "@/lib/tap-card/trail-pass-report";

const row = (over: Partial<{ memberId: string | null; amountCents: number; paidAt: string; refundedAt: string | null }> = {}) => ({
  memberId: "a",
  amountCents: 2000,
  paidAt: "2027-03-10T20:00:00Z",
  refundedAt: null,
  ...over,
});

describe("monthlyCommission", () => {
  it("adds up each brewery's sales per month at the commission rate", () => {
    expect(monthlyCommission([row(), row()], 50)).toEqual([
      { month: "2027-03", memberId: "a", sold: 2, refunded: 0, grossCents: 4000, commissionCents: 2000 },
    ]);
  });
  it("leaves refunds out of sales and commission", () => {
    expect(monthlyCommission([row(), row({ refundedAt: "2027-03-12T00:00:00Z" })], 50)).toEqual([
      { month: "2027-03", memberId: "a", sold: 1, refunded: 1, grossCents: 2000, commissionCents: 1000 },
    ]);
  });
  it("uses Pacific months", () => {
    // 9 p.m. January 31 in California is already February in UTC.
    expect(monthlyCommission([row({ paidAt: "2027-02-01T05:00:00Z" })], 50)[0].month).toBe("2027-01");
  });
  it("keeps breweries and unassigned sales apart, newest month first", () => {
    const out = monthlyCommission([row({ memberId: "b", paidAt: "2027-01-05T20:00:00Z" }), row({ memberId: null }), row()], 50);
    expect(out.map((r) => [r.month, r.memberId])).toEqual([
      ["2027-03", "a"],
      ["2027-03", null],
      ["2027-01", "b"],
    ]);
  });
  it("rounds commission to the cent", () => {
    expect(monthlyCommission([row({ amountCents: 1999 })], 50)[0].commissionCents).toBe(1000);
  });
});
