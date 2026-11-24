import { describe, expect, it } from "vitest";
import { planTrailRepair } from "@/lib/tap-card/trail-repair";

const START = new Date("2027-03-01T20:00:00Z");
const at = (minutes: number) => new Date(START.getTime() + minutes * 60_000);

const base = {
  join: { email: "Pat@example.test", memberId: "brewery1", optIn: true, createdAt: START },
  card: { id: "new", email: "pat.other@example.test" },
  previous: { id: "old", email: "pat@example.test" },
  passes: [{ paymentId: "pay1", paidAt: at(2), memberId: null as string | null, year: 2027 }],
  joinEmailPaid: false,
  previousYears: [] as number[],
  onlyThisPayment: true,
};
const full = { paymentId: "pay1", creditTo: "brewery1", subscribeTo: "brewery1", moveTo: "old" };

describe("planTrailRepair", () => {
  it("credits the brewery, saves the opt-in and moves the pass to the card they started on", () => {
    expect(planTrailRepair(base)).toEqual(full);
  });
  it("a customer with no earlier card keeps the new one", () => {
    expect(planTrailRepair({ ...base, previous: null })).toEqual({ ...full, moveTo: null });
  });
  it("does nothing when the emails match or the sign-up email paid too", () => {
    expect(planTrailRepair({ ...base, card: { id: "old", email: "pat@example.test" } })).toBeNull();
    expect(planTrailRepair({ ...base, joinEmailPaid: true })).toBeNull();
  });
  it("ignores a pass paid before the sign-up or more than 2 hours after", () => {
    for (const minutes of [-3, 121]) {
      expect(planTrailRepair({ ...base, passes: [{ ...base.passes[0], paidAt: at(minutes) }] })).toBeNull();
    }
    expect(planTrailRepair({ ...base, passes: [] })).toBeNull();
  });
  it("never takes another brewery's sale", () => {
    expect(planTrailRepair({ ...base, passes: [{ ...base.passes[0], memberId: "brewery2" }] })).toBeNull();
  });
  it("already credited to this brewery (by the buyer's email): still moves and opts in", () => {
    expect(planTrailRepair({ ...base, passes: [{ ...base.passes[0], memberId: "brewery1" }] })).toEqual({ ...full, creditTo: null });
  });
  it("opts in only when the box was checked", () => {
    expect(planTrailRepair({ ...base, join: { ...base.join, optIn: false } })?.subscribeTo).toBeNull();
  });
  it("leaves the pass when the earlier card isn't the sign-up's, has that year, or the new card is in use", () => {
    expect(planTrailRepair({ ...base, previous: { id: "x", email: "sam@example.test" } })?.moveTo).toBeNull();
    expect(planTrailRepair({ ...base, previousYears: [2027] })?.moveTo).toBeNull();
    expect(planTrailRepair({ ...base, onlyThisPayment: false })?.moveTo).toBeNull();
  });
  it("a sign-up with no plate credits nobody", () => {
    expect(planTrailRepair({ ...base, join: { ...base.join, memberId: null } })).toEqual({ ...full, creditTo: null, subscribeTo: null });
  });
});
