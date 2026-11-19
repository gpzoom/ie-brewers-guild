import { describe, expect, it } from "vitest";
import { hasTrailPass, recordZeffyPayment, type TrailPassStore } from "@/lib/tap-card/trail-pass-core";
import type { ZeffyPayment } from "@/lib/tap-card/zeffy";

const PAID = new Date("2027-03-01T20:00:00Z");

type Pass = { paymentId: string; itemId: string; holderId: string; memberId: string | null; year: number; amountCents: number; refundedAt: Date | null };

function fakeStore(init: { holders?: { id: string; email: string; createdAt: string }[]; joins?: { id: string; email: string; memberId: string | null; optIn: boolean; createdAt: Date }[] } = {}) {
  const holders = [...(init.holders ?? [])];
  const joins = init.joins ?? [];
  const passes: Pass[] = [];
  const subscribers: { memberId: string; holderId: string }[] = [];
  let n = 0;
  const store: TrailPassStore & { passYears(holderId: string): Promise<number[]> } = {
    async campaignByZeffyId(id) {
      return id === "camp_2027" ? { year: 2027 } : null;
    },
    async findHolderByEmail(email) {
      const h = holders.find((x) => x.email.toLowerCase() === email.toLowerCase());
      return h ? { id: h.id, createdAt: h.createdAt } : null;
    },
    async createHolder(h) {
      const id = `holder_${++n}`;
      holders.push({ id, email: h.email, createdAt: new Date().toISOString() });
      return { id };
    },
    async latestJoin(email, before) {
      const j = joins
        .filter((x) => x.email.toLowerCase() === email.toLowerCase() && x.createdAt.getTime() <= before.getTime())
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      return j ? { id: j.id, memberId: j.memberId, optIn: j.optIn } : null;
    },
    async insertPass(p) {
      if (passes.some((x) => x.paymentId === p.paymentId && x.itemId === p.itemId)) return "duplicate";
      passes.push({ ...p, refundedAt: null });
      return "ok";
    },
    async markRefunded(paymentId, at) {
      for (const p of passes) if (p.paymentId === paymentId && !p.refundedAt) p.refundedAt = at;
    },
    async addSubscriber(memberId, holderId) {
      if (!subscribers.some((s) => s.memberId === memberId && s.holderId === holderId)) subscribers.push({ memberId, holderId });
    },
    async passYears(holderId) {
      return passes.filter((p) => p.holderId === holderId && !p.refundedAt).map((p) => p.year);
    },
  };
  return { store, holders, passes, subscribers };
}

function pay(over: Partial<ZeffyPayment> = {}): ZeffyPayment {
  return {
    id: "pay_1",
    createdAt: PAID,
    campaignId: "camp_2027",
    succeeded: true,
    refunded: false,
    buyer: { email: "pat@example.test", name: "Pat Pass" },
    items: [{ id: "item_1", amountCents: 2000, email: "Pat@Example.test", name: "Pat Pass" }],
    ...over,
  };
}

const join = (over: Partial<{ id: string; email: string; memberId: string | null; optIn: boolean; createdAt: Date }> = {}) => ({
  id: "join_1",
  email: "pat@example.test",
  memberId: "brewery_a",
  optIn: true,
  createdAt: new Date(PAID.getTime() - 3 * 60_000),
  ...over,
});

describe("recordZeffyPayment", () => {
  it("records one pass credited to the brewery whose plate started the sign-up", async () => {
    const f = fakeStore({ joins: [join()] });
    const r = await recordZeffyPayment(f.store, pay(), PAID);
    expect(r).toEqual({ kind: "recorded", passes: [{ itemId: "item_1", holderId: "holder_1", email: "Pat@Example.test", holderExisted: false, memberId: "brewery_a" }] });
    expect(f.passes).toEqual([{ paymentId: "pay_1", itemId: "item_1", holderId: "holder_1", memberId: "brewery_a", year: 2027, amountCents: 2000, paidAt: PAID, refundedAt: null }]);
    expect(f.subscribers).toEqual([{ memberId: "brewery_a", holderId: "holder_1" }]);
  });

  it("uses the newest sign-up made before the payment", async () => {
    const f = fakeStore({
      joins: [
        join({ id: "old", memberId: "brewery_old", createdAt: new Date(PAID.getTime() - 86_400_000) }),
        join({ id: "new", memberId: "brewery_new" }),
        join({ id: "later", memberId: "brewery_later", createdAt: new Date(PAID.getTime() + 3_600_000) }),
      ],
    });
    const r = await recordZeffyPayment(f.store, pay(), PAID);
    expect(r.kind === "recorded" && r.passes[0].memberId).toBe("brewery_new");
  });

  it("credits every pass in the payment to that brewery, but subscribes only the person who checked the box", async () => {
    const f = fakeStore({ joins: [join()] });
    const r = await recordZeffyPayment(
      f.store,
      pay({ items: [pay().items[0], { id: "item_2", amountCents: 2000, email: "sam@example.test", name: "Sam Second" }] }),
      PAID,
    );
    expect(r.kind === "recorded" && r.passes.map((p) => [p.email, p.memberId])).toEqual([
      ["Pat@Example.test", "brewery_a"],
      ["sam@example.test", "brewery_a"],
    ]);
    expect(f.holders).toHaveLength(2);
    expect(f.subscribers).toEqual([{ memberId: "brewery_a", holderId: "holder_1" }]);
  });

  it("finds the sign-up by the buyer's email when the pass has someone else's", async () => {
    const f = fakeStore({ joins: [join()] });
    const r = await recordZeffyPayment(f.store, pay({ items: [{ id: "item_9", amountCents: 2000, email: "gift@example.test", name: "Gift" }] }), PAID);
    expect(r.kind === "recorded" && r.passes[0].memberId).toBe("brewery_a");
  });

  it("leaves the brewery empty when no sign-up matches (Guild assigns by hand)", async () => {
    const f = fakeStore();
    const r = await recordZeffyPayment(f.store, pay(), PAID);
    expect(r.kind === "recorded" && r.passes[0].memberId).toBeNull();
  });

  it("is harmless to run twice (webhook and return page)", async () => {
    const f = fakeStore({ joins: [join()] });
    const first = await recordZeffyPayment(f.store, pay(), PAID);
    const second = await recordZeffyPayment(f.store, pay(), PAID);
    expect(f.passes).toHaveLength(1);
    expect(f.holders).toHaveLength(1);
    expect(second.kind === "recorded" && second.passes[0].holderId).toBe(first.kind === "recorded" && first.passes[0].holderId);
  });

  it("ignores other campaigns and unfinished payments", async () => {
    const f = fakeStore();
    expect(await recordZeffyPayment(f.store, pay({ campaignId: "other" }), PAID)).toEqual({ kind: "ignored" });
    expect(await recordZeffyPayment(f.store, pay({ succeeded: false }), PAID)).toEqual({ kind: "ignored" });
    expect(f.passes).toHaveLength(0);
  });

  it("marks a refunded payment's passes", async () => {
    const f = fakeStore();
    await recordZeffyPayment(f.store, pay(), PAID);
    expect(await recordZeffyPayment(f.store, pay({ refunded: true }), PAID)).toEqual({ kind: "refunded" });
    expect(f.passes[0].refundedAt).toEqual(PAID);
  });

  it("adds no subscriber without the box checked", async () => {
    const f = fakeStore({ joins: [join({ optIn: false })] });
    await recordZeffyPayment(f.store, pay(), PAID);
    expect(f.subscribers).toEqual([]);
  });

  it("flags an email that already had a card before this payment", async () => {
    const f = fakeStore({ holders: [{ id: "h_old", email: "pat@example.test", createdAt: "2026-12-01T00:00:00Z" }] });
    const r = await recordZeffyPayment(f.store, pay(), PAID);
    expect(r.kind === "recorded" && r.passes[0]).toMatchObject({ holderId: "h_old", holderExisted: true });
  });
});

describe("hasTrailPass", () => {
  it("counts only an unrefunded pass for that exact trail year", async () => {
    const f = fakeStore();
    // Bought in December 2026, for the 2027 trail.
    await recordZeffyPayment(f.store, pay({ createdAt: new Date("2026-12-15T20:00:00Z") }), PAID);
    expect(await hasTrailPass(f.store, "holder_1", 2027)).toBe(true);
    expect(await hasTrailPass(f.store, "holder_1", 2026)).toBe(false);
    await recordZeffyPayment(f.store, pay({ refunded: true }), PAID);
    expect(await hasTrailPass(f.store, "holder_1", 2027)).toBe(false);
  });
});
