import { describe, expect, it } from "vitest";
import { checkInVisit, undoBarReward, useBarReward, type BarStore, type VisitInput } from "@/lib/tap-card/bar-core";
import type { LiveOffer, OfferSlot } from "@/lib/tap-card/loyalty";
import { STANDARD_OFFER } from "@/lib/tap-card/tap-card-copy";

type Visit = { id: string; holderId: string; memberId: string; day: string; redeemedYear: number | null };
type Earned = {
  id: string;
  holderId: string;
  memberId: string;
  slot: OfferSlot;
  reward: string;
  terms: string;
  visitId: string;
  earnedAt: string;
  expiresAt: string;
  usedVisitId: string | null;
  usedDeviceId: string | null;
};

function memoryStore(seed: { visits?: Visit[]; offers?: Record<string, LiveOffer[]>; expiry?: Record<string, number>; earned?: Earned[] } = {}) {
  const visits: Visit[] = seed.visits ?? [];
  const earned: Earned[] = seed.earned ?? [];
  let n = 0;
  const store: BarStore = {
    async findVisit(holderId, memberId, day) {
      const v = visits.find((x) => x.holderId === holderId && x.memberId === memberId && x.day === day);
      return v ? { id: v.id, redeemedYear: v.redeemedYear } : null;
    },
    async insertVisit(v) {
      if (visits.some((x) => x.holderId === v.holderId && x.memberId === v.memberId && x.day === v.day)) return "duplicate";
      visits.push({ id: `v${++n}`, holderId: v.holderId, memberId: v.memberId, day: v.day, redeemedYear: null });
      return "ok";
    },
    async countVisits(holderId, memberId) {
      return visits.filter((x) => x.holderId === holderId && x.memberId === memberId).length;
    },
    async trailRedeemedIn(holderId, memberId, year) {
      const v = visits.find((x) => x.holderId === holderId && x.memberId === memberId && x.redeemedYear === year);
      return v ? { visitId: v.id, day: v.day } : null;
    },
    async setTrailRedeemed(visitId, year) {
      const v = visits.find((x) => x.id === visitId)!;
      if (year !== null && visits.some((x) => x !== v && x.holderId === v.holderId && x.memberId === v.memberId && x.redeemedYear === year)) {
        return "duplicate";
      }
      v.redeemedYear = year;
      return "ok";
    },
    async liveOffers(memberId) {
      return seed.offers?.[memberId] ?? [];
    },
    async stepsEarned(holderId, memberId) {
      return new Set(earned.filter((e) => e.holderId === holderId && e.memberId === memberId && e.slot !== "repeat").map((e) => e.slot));
    },
    async expiryDays(memberId) {
      return seed.expiry?.[memberId] ?? 90;
    },
    async insertEarned(r) {
      if (earned.some((e) => e.visitId === r.visitId && e.slot === r.slot)) return "duplicate";
      if (r.slot !== "repeat" && earned.some((e) => e.holderId === r.holderId && e.memberId === r.memberId && e.slot === r.slot)) return "duplicate";
      earned.push({
        id: `e${++n}`,
        holderId: r.holderId,
        memberId: r.memberId,
        slot: r.slot,
        reward: r.reward,
        terms: r.terms,
        visitId: r.visitId,
        earnedAt: r.earnedAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
        usedVisitId: null,
        usedDeviceId: null,
      });
      return "ok";
    },
    async banked(holderId, memberId) {
      return earned
        .filter((e) => e.holderId === holderId && e.memberId === memberId && e.usedVisitId === null)
        .map((e) => ({ id: e.id, reward: e.reward, terms: e.terms, expiresAt: e.expiresAt, earnedAt: e.earnedAt }));
    },
    async memberRewardUsedOn(visitId) {
      const e = earned.find((x) => x.usedVisitId === visitId);
      return e ? { id: e.id, reward: e.reward, terms: e.terms, expiresAt: e.expiresAt } : null;
    },
    async markUsed(rewardId, visitId, deviceId) {
      const e = earned.find((x) => x.id === rewardId);
      if (!e || e.usedVisitId !== null || earned.some((x) => x.usedVisitId === visitId)) return "taken";
      e.usedVisitId = visitId;
      e.usedDeviceId = deviceId;
      return "ok";
    },
    async clearUse(rewardId, visitId) {
      const e = earned.find((x) => x.id === rewardId && x.usedVisitId === visitId);
      if (e) {
        e.usedVisitId = null;
        e.usedDeviceId = null;
      }
    },
  };
  return { store, visits, earned };
}

const at = new Date("2026-06-10T20:00:00Z"); // June 10, Pacific
const input: VisitInput = { holderId: "h1", memberId: "m1", cardId: "c1", deviceId: "d1", at };
const pretzel: LiveOffer = { slot: "step1", visitNumber: 2, reward: "Free soft pretzel", terms: "Food only" };
const twoOff: LiveOffer = { slot: "repeat", visitNumber: 2, reward: "$2 off", terms: "" };
const earlier = (day: string, id = "old1", redeemedYear: number | null = null): Visit => ({ id, holderId: "h1", memberId: "m1", day, redeemedYear });
const banked = (o: Partial<Earned> = {}): Earned => ({
  id: "b1",
  holderId: "h1",
  memberId: "m1",
  slot: "step1",
  reward: "Pint glass",
  terms: "",
  visitId: "old1",
  earnedAt: "2026-05-01T00:00:00.000Z",
  expiresAt: "2026-08-01T00:00:00.000Z",
  usedVisitId: null,
  usedDeviceId: null,
  ...o,
});

describe("checkInVisit", () => {
  it("records the first visit and features the Beer Trail offer", async () => {
    const { store, visits } = memoryStore();
    const state = await checkInVisit(store, input);
    expect(visits).toHaveLength(1);
    expect(state).toEqual({
      visitNumber: 1,
      firstToday: true,
      used: null,
      featured: { kind: "trail", reward: STANDARD_OFFER },
      others: [],
      newlyEarned: [],
    });
  });

  it("opening twice the same day records one visit and earns nothing new", async () => {
    const { store, visits, earned } = memoryStore({ visits: [earlier("2026-06-01")], offers: { m1: [pretzel, twoOff] } });
    const first = await checkInVisit(store, input);
    expect(first.visitNumber).toBe(2);
    expect(first.newlyEarned).toEqual(["Free soft pretzel", "$2 off"]);
    const second = await checkInVisit(store, input);
    expect(second.firstToday).toBe(false);
    expect(second.visitNumber).toBe(2);
    expect(second.newlyEarned).toEqual([]);
    expect(visits).toHaveLength(2);
    expect(earned).toHaveLength(2);
  });

  it("banks an earned reward with the brewery's expiry", async () => {
    const { store, earned } = memoryStore({ visits: [earlier("2026-06-01", "old1", 2026)], offers: { m1: [pretzel] }, expiry: { m1: 30 } });
    const state = await checkInVisit(store, input);
    expect(earned[0].expiresAt).toBe("2026-07-11T06:59:59.999Z");
    expect(state.featured).toEqual({ kind: "member", id: earned[0].id, reward: "Free soft pretzel", terms: "Food only", expiresAt: "2026-07-11T06:59:59.999Z" });
  });

  it("features the soonest-expiring reward once the Beer Trail offer is used this year", async () => {
    const { store } = memoryStore({
      visits: [earlier("2026-06-01", "old1", 2026)],
      earned: [banked({ id: "late", expiresAt: "2026-09-01T00:00:00.000Z" }), banked({ id: "soon", slot: "step2", reward: "Sticker", expiresAt: "2026-07-01T00:00:00.000Z" })],
    });
    const state = await checkInVisit(store, input);
    expect(state.featured).toMatchObject({ kind: "member", id: "soon" });
    expect(state.others).toEqual([expect.objectContaining({ id: "late" })]);
  });
});

describe("useBarReward", () => {
  it("uses the Beer Trail offer once a visit", async () => {
    const { store, visits } = memoryStore();
    await checkInVisit(store, input);
    const used = await useBarReward(store, { ...input, choice: { kind: "trail" } });
    expect(used.outcome).toBe("used");
    expect(used.state.used).toEqual({ kind: "trail", reward: STANDARD_OFFER });
    expect(used.state.featured).toBeNull();
    expect(visits[0].redeemedYear).toBe(2026);
    expect((await useBarReward(store, { ...input, choice: { kind: "trail" } })).outcome).toBe("already-used-today");
  });

  it("uses a member reward, and then nothing else that visit", async () => {
    const { store, earned } = memoryStore({ earned: [banked()] });
    await checkInVisit(store, input);
    const used = await useBarReward(store, { ...input, choice: { kind: "member", id: "b1" } });
    expect(used.outcome).toBe("used");
    expect(earned[0].usedDeviceId).toBe("d1");
    expect(used.state.used).toMatchObject({ kind: "member", id: "b1" });
    expect((await useBarReward(store, { ...input, choice: { kind: "trail" } })).outcome).toBe("already-used-today");
  });

  it("using an expired reward is refused", async () => {
    const { store } = memoryStore({ earned: [banked({ expiresAt: "2026-06-10T19:00:00.000Z" })] });
    await checkInVisit(store, input);
    expect((await useBarReward(store, { ...input, choice: { kind: "member", id: "b1" } })).outcome).toBe("not-available");
  });

  it("never uses another brewery's reward", async () => {
    const { store } = memoryStore({ earned: [banked({ memberId: "m2" })] });
    await checkInVisit(store, input);
    expect((await useBarReward(store, { ...input, choice: { kind: "member", id: "b1" } })).outcome).toBe("not-available");
  });

  it("needs today's visit first", async () => {
    const { store } = memoryStore({ earned: [banked()] });
    expect((await useBarReward(store, { ...input, choice: { kind: "member", id: "b1" } })).outcome).toBe("not-available");
  });
});

describe("undoBarReward", () => {
  it("puts the reward back, and another can be used instead", async () => {
    const { store, earned } = memoryStore({ visits: [earlier("2026-06-01", "old1", 2026)], earned: [banked(), banked({ id: "b2", slot: "step2", reward: "Sticker" })] });
    await checkInVisit(store, input);
    await useBarReward(store, { ...input, choice: { kind: "member", id: "b1" } });
    const undone = await undoBarReward(store, input);
    expect(undone.outcome).toBe("undone");
    expect(earned[0].usedVisitId).toBeNull();
    expect(undone.state.used).toBeNull();
    expect((await useBarReward(store, { ...input, choice: { kind: "member", id: "b2" } })).outcome).toBe("used");
  });

  it("puts the Beer Trail offer back", async () => {
    const { store, visits } = memoryStore();
    await checkInVisit(store, input);
    await useBarReward(store, { ...input, choice: { kind: "trail" } });
    expect((await undoBarReward(store, input)).outcome).toBe("undone");
    expect(visits[0].redeemedYear).toBeNull();
  });

  it("has nothing to undo when nothing was used, or there's no visit today", async () => {
    const { store } = memoryStore();
    expect((await undoBarReward(store, input)).outcome).toBe("nothing-to-undo");
    await checkInVisit(store, input);
    expect((await undoBarReward(store, input)).outcome).toBe("nothing-to-undo");
  });

  it("won't undo yesterday's use", async () => {
    const { store } = memoryStore({ visits: [earlier("2026-06-09", "old1", 2026)] });
    await checkInVisit(store, input);
    expect((await undoBarReward(store, input)).outcome).toBe("nothing-to-undo");
  });
});
