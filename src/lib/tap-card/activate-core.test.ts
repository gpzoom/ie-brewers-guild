import { describe, expect, it } from "vitest";
import { activateCore, type ActivateInput, type ActivateStore } from "./activate-core";

type Card = { id: string; code: string; holderId: string | null };
type Holder = { id: string; name: string; email: string; via: "customer" | "staff"; memberId: string | null };

function memoryStore(cards: Card[], holders: Holder[] = []) {
  let n = 0;
  const store: ActivateStore = {
    async findCard(code) {
      const c = cards.find((x) => x.code === code);
      return c ? { id: c.id, holderId: c.holderId } : null;
    },
    async findHolderIdByEmail(email) {
      return holders.find((h) => h.email.toLowerCase() === email.toLowerCase())?.id ?? null;
    },
    async createHolder(h) {
      const id = `h${++n}`;
      holders.push({ id, name: h.name, email: h.email, via: h.ageConfirmedVia, memberId: h.activatedByMemberId });
      return id;
    },
    async linkCard(cardId, holderId) {
      const c = cards.find((x) => x.id === cardId)!;
      if (c.holderId) return "already-active";
      c.holderId = holderId;
      return "ok";
    },
  };
  return { store, cards, holders };
}

const input = (over: Partial<ActivateInput> = {}): ActivateInput => ({
  code: "abcd-2345",
  name: "Pat Tester",
  email: "pat@example.com",
  ageConfirmed: true,
  via: "customer",
  memberId: null,
  ...over,
});

describe("activateCore", () => {
  it("an unknown card is refused", async () => {
    const { store } = memoryStore([]);
    expect(await activateCore(store, input())).toEqual({ kind: "unknown-card" });
  });

  it("a card that's already active is refused", async () => {
    const { store } = memoryStore([{ id: "c1", code: "ABCD2345", holderId: "h9" }]);
    expect(await activateCore(store, input())).toEqual({ kind: "already-active" });
  });

  it("a new email makes a new holder and links the card", async () => {
    const { store, cards, holders } = memoryStore([{ id: "c1", code: "ABCD2345", holderId: null }]);
    expect(await activateCore(store, input({ via: "staff", memberId: "m1" }))).toEqual({
      kind: "activated",
      holderId: "h1",
      joinedExisting: false,
    });
    expect(cards[0].holderId).toBe("h1");
    expect(holders[0]).toEqual({ id: "h1", name: "Pat Tester", email: "pat@example.com", via: "staff", memberId: "m1" });
  });

  it("the same email in another case joins the existing holder (a replacement card)", async () => {
    const { store, cards, holders } = memoryStore(
      [{ id: "c2", code: "ABCD2345", holderId: null }],
      [{ id: "h7", name: "Pat", email: "pat@x.com", via: "customer", memberId: null }],
    );
    expect(await activateCore(store, input({ email: "  Pat@X.com " }))).toEqual({
      kind: "activated",
      holderId: "h7",
      joinedExisting: true,
    });
    expect(cards[0].holderId).toBe("h7");
    expect(holders).toHaveLength(1);
  });

  it("requires the age confirmation", async () => {
    const { store } = memoryStore([{ id: "c1", code: "ABCD2345", holderId: null }]);
    const result = await activateCore(store, input({ ageConfirmed: false }));
    expect(result).toEqual({ kind: "invalid", errors: { ageConfirmed: "Please confirm you are 21 or older." } });
    const staff = await activateCore(store, input({ ageConfirmed: false, via: "staff" }));
    expect(staff).toEqual({ kind: "invalid", errors: { ageConfirmed: "Check their ID, then tick the box." } });
  });

  it("requires a name and a valid email", async () => {
    const { store } = memoryStore([{ id: "c1", code: "ABCD2345", holderId: null }]);
    expect(await activateCore(store, input({ name: "   ", email: "nope" }))).toEqual({
      kind: "invalid",
      errors: { name: "Enter a name.", email: "Enter a valid email address." },
    });
    expect(await activateCore(store, input({ name: "x".repeat(81) }))).toEqual({
      kind: "invalid",
      errors: { name: "Keep the name to 80 characters or fewer." },
    });
  });
});
