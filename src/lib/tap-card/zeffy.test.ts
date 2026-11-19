import { describe, expect, it } from "vitest";
import { parseZeffyPayment, passLines, webhookPaymentId } from "@/lib/tap-card/zeffy";

/** Shaped like a real Zeffy payment (2026-11-19), with made-up values. */
function payment(over: Record<string, unknown> = {}) {
  return {
    id: "pay_1",
    object: "payment",
    created: 1795000000,
    amount: 2000,
    currency: "usd",
    status: "succeeded",
    type: "online",
    refund_status: "none",
    refunds: [],
    campaign_type: "ticketing",
    campaign_id: "camp_1",
    campaign_category: "membership",
    buyer: { email: " Buyer@Example.test ", first_name: "Bea", last_name: "Buyer", address: {} },
    items: [
      {
        id: "item_1",
        object: "item",
        type: "ticket",
        amount: 2000,
        rate_title: "Beer Trail Pass",
        questions: [
          { question: "Full Name", type: "name", answer: "Pat Pass" },
          { question: "Email", type: "email", answer: "Pat@Example.test" },
        ],
      },
    ],
    ...over,
  };
}

describe("parseZeffyPayment", () => {
  it("reads the fields we use", () => {
    const p = parseZeffyPayment(payment());
    expect(p).toEqual({
      id: "pay_1",
      createdAt: new Date(1795000000 * 1000),
      campaignId: "camp_1",
      succeeded: true,
      refunded: false,
      buyer: { email: "Buyer@Example.test", name: "Bea Buyer" },
      items: [{ id: "item_1", amountCents: 2000, email: "Pat@Example.test", name: "Pat Pass" }],
    });
  });
  it("sees a refund and a failed payment", () => {
    expect(parseZeffyPayment(payment({ refund_status: "full" }))?.refunded).toBe(true);
    expect(parseZeffyPayment(payment({ status: "failed" }))?.succeeded).toBe(false);
  });
  it("skips anything that isn't a ticket", () => {
    const p = parseZeffyPayment(payment({ items: [{ id: "d", type: "donation", amount: 500, questions: [] }] }));
    expect(p?.items).toEqual([]);
  });
  it("refuses junk", () => {
    expect(parseZeffyPayment(null)).toBeNull();
    expect(parseZeffyPayment({ ...payment(), id: undefined })).toBeNull();
    expect(parseZeffyPayment({ ...payment(), campaign_id: 5 })).toBeNull();
  });
});

describe("passLines", () => {
  it("uses each pass's own name and email, else the buyer's", () => {
    const p = parseZeffyPayment(
      payment({
        items: [
          payment().items[0],
          { id: "item_2", type: "ticket", amount: 2000, questions: [] },
        ],
      }),
    )!;
    expect(passLines(p)).toEqual([
      { itemId: "item_1", email: "Pat@Example.test", name: "Pat Pass", amountCents: 2000 },
      { itemId: "item_2", email: "Buyer@Example.test", name: "Bea Buyer", amountCents: 2000 },
    ]);
  });
});

describe("webhookPaymentId", () => {
  it("finds the payment id in the usual places", () => {
    expect(webhookPaymentId({ type: "payment.completed", data: { id: "pay_9" } })).toBe("pay_9");
    expect(webhookPaymentId({ data: { object: { id: "pay_8" } } })).toBe("pay_8");
    expect(webhookPaymentId({ payment: { id: "pay_7" } })).toBe("pay_7");
  });
  it("returns null for anything else", () => {
    for (const bad of [null, "x", {}, { data: {} }, { data: { id: 5 } }]) expect(webhookPaymentId(bad)).toBeNull();
  });
});
