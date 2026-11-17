import { describe, expect, it } from "vitest";
import { deactivateCardCore, type DeactivateStore } from "./deactivate-core";

function store(cards: { id: string; code: string; holderId: string | null; off: boolean }[]) {
  const s: DeactivateStore = {
    async findCard(code) {
      const c = cards.find((x) => x.code === code);
      return c ? { id: c.id, holderId: c.holderId, deactivated: c.off } : null;
    },
    async deactivate(cardId) {
      cards.find((x) => x.id === cardId)!.off = true;
    },
  };
  return s;
}

describe("deactivateCardCore", () => {
  it("turns off the holder's own card", async () => {
    const cards = [{ id: "c1", code: "ABCD2345", holderId: "h1", off: false }];
    expect(await deactivateCardCore(store(cards), "h1", "abcd-2345")).toEqual({ kind: "turned-off" });
    expect(cards[0].off).toBe(true);
  });

  it("never touches someone else's card, an unknown code, or one already off", async () => {
    const cards = [
      { id: "c1", code: "ABCD2345", holderId: "h2", off: false },
      { id: "c2", code: "WXYZ6789", holderId: "h1", off: true },
    ];
    expect(await deactivateCardCore(store(cards), "h1", "ABCD2345")).toEqual({ kind: "not-yours" });
    expect(cards[0].off).toBe(false);
    expect(await deactivateCardCore(store(cards), "h1", "ZZZZ9999")).toEqual({ kind: "not-yours" });
    expect(await deactivateCardCore(store(cards), "h1", "WXYZ6789")).toEqual({ kind: "turned-off" });
  });
});
