import { describe, expect, it } from "vitest";
import { checkInCore, redemptionStatus, type CheckInStore } from "./check-in-core";

type Row = { id: string; holderId: string; memberId: string; day: string; redeemedYear: number | null };

function memoryStore(opts: { raceOnInsert?: boolean } = {}) {
  const rows: Row[] = [];
  let n = 0;
  const same = (x: Row, holderId: string, memberId: string) => x.holderId === holderId && x.memberId === memberId;
  const store: CheckInStore = {
    async findVisit(holderId, memberId, day) {
      const r = rows.find((x) => same(x, holderId, memberId) && x.day === day);
      return r ? { id: r.id, redeemedYear: r.redeemedYear } : null;
    },
    async hasRedeemed(holderId, memberId, year) {
      const r = rows.find((x) => same(x, holderId, memberId) && x.redeemedYear === year);
      return r ? { day: r.day } : null;
    },
    async insertVisit(v) {
      if (opts.raceOnInsert) return "duplicate";
      if (rows.some((x) => same(x, v.holderId, v.memberId) && x.day === v.day)) return "duplicate";
      if (v.redeemedYear !== null && rows.some((x) => same(x, v.holderId, v.memberId) && x.redeemedYear === v.redeemedYear))
        return "duplicate";
      rows.push({ id: `v${++n}`, holderId: v.holderId, memberId: v.memberId, day: v.day, redeemedYear: v.redeemedYear });
      return "ok";
    },
    async markRedeemed(visitId, year) {
      const r = rows.find((x) => x.id === visitId)!;
      if (rows.some((x) => x !== r && same(x, r.holderId, r.memberId) && x.redeemedYear === year)) return "duplicate";
      r.redeemedYear = year;
      return "ok";
    },
  };
  return { store, rows };
}

const base = { holderId: "h1", memberId: "m1", cardId: "c1", deviceId: "d1" };
const june1 = new Date("2026-06-01T20:00:00Z");
const june2 = new Date("2026-06-02T20:00:00Z");

describe("checkInCore", () => {
  it("records a first visit without redeeming", async () => {
    const { store, rows } = memoryStore();
    expect(await checkInCore(store, { ...base, redeem: false, at: june1 })).toEqual({ kind: "recorded", redeemed: false });
    expect(rows).toHaveLength(1);
  });

  it("a second visit the same day is already recorded", async () => {
    const { store, rows } = memoryStore();
    await checkInCore(store, { ...base, redeem: false, at: june1 });
    expect(await checkInCore(store, { ...base, redeem: false, at: june1 })).toEqual({
      kind: "already-visited-today",
      redeemed: false,
    });
    expect(rows).toHaveLength(1);
  });

  it("redeeming later the same day marks the visit already recorded today", async () => {
    const { store, rows } = memoryStore();
    await checkInCore(store, { ...base, redeem: false, at: june1 });
    expect(await checkInCore(store, { ...base, redeem: true, at: june1 })).toEqual({ kind: "recorded", redeemed: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].redeemedYear).toBe(2026);
  });

  it("a second redemption the same year is refused but the visit still counts", async () => {
    const { store, rows } = memoryStore();
    await checkInCore(store, { ...base, redeem: true, at: june1 });
    expect(await checkInCore(store, { ...base, redeem: true, at: june2 })).toEqual({
      kind: "already-redeemed",
      redeemedOn: "2026-06-01",
      visitRecorded: true,
    });
    expect(rows).toHaveLength(2);
    expect(rows[1].redeemedYear).toBeNull();
  });

  it("a second redemption the same day reports already-redeemed without a new visit", async () => {
    const { store, rows } = memoryStore();
    await checkInCore(store, { ...base, redeem: true, at: june1 });
    expect(await checkInCore(store, { ...base, redeem: true, at: june1 })).toEqual({
      kind: "already-redeemed",
      redeemedOn: "2026-06-01",
      visitRecorded: false,
    });
    expect(rows).toHaveLength(1);
  });

  it("a race on insert (two devices at once) reports already recorded", async () => {
    const { store } = memoryStore({ raceOnInsert: true });
    expect(await checkInCore(store, { ...base, redeem: true, at: june1 })).toEqual({
      kind: "already-visited-today",
      redeemed: false,
    });
  });

  it("New Year's Eve and just after midnight are different years", async () => {
    const { store } = memoryStore();
    const eve = new Date("2027-01-01T07:30:00Z");
    const newYear = new Date("2027-01-01T08:30:00Z");
    expect(await checkInCore(store, { ...base, redeem: true, at: eve })).toEqual({ kind: "recorded", redeemed: true });
    expect(await checkInCore(store, { ...base, redeem: true, at: newYear })).toEqual({ kind: "recorded", redeemed: true });
  });
});

describe("redemptionStatus", () => {
  it("is available until redeemed this year, and again next year", async () => {
    const { store } = memoryStore();
    expect(await redemptionStatus(store, "h1", "m1", june1)).toEqual({ available: true });
    await checkInCore(store, { ...base, redeem: true, at: june1 });
    expect(await redemptionStatus(store, "h1", "m1", june2)).toEqual({ available: false, redeemedOn: "2026-06-01" });
    expect(await redemptionStatus(store, "h1", "m1", new Date("2027-02-01T20:00:00Z"))).toEqual({ available: true });
  });
});
