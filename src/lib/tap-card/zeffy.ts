/**
 * Zeffy payments, read into the few fields the Beer Trail Pass needs
 * (spec 2026-11-19). Pure -- no network here; see zeffy.server.ts.
 */

export type ZeffyPayment = {
  id: string;
  createdAt: Date;
  campaignId: string;
  succeeded: boolean;
  refunded: boolean;
  buyer: { email: string; name: string };
  items: { id: string; amountCents: number; email: string | null; name: string | null }[];
};

export type PassLine = { itemId: string; email: string; name: string; amountCents: number };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

function answer(questions: unknown, type: "name" | "email"): string | null {
  if (!Array.isArray(questions)) return null;
  for (const q of questions) if (isObj(q) && q.type === type) return str(q.answer);
  return null;
}

export function parseZeffyPayment(raw: unknown): ZeffyPayment | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const campaignId = str(raw.campaign_id);
  if (!id || !campaignId || typeof raw.created !== "number") return null;
  const buyer = isObj(raw.buyer) ? raw.buyer : {};
  const items = Array.isArray(raw.items) ? raw.items : [];
  return {
    id,
    createdAt: new Date(raw.created * 1000),
    campaignId,
    succeeded: raw.status === "succeeded",
    refunded: typeof raw.refund_status === "string" && raw.refund_status !== "none",
    buyer: {
      email: str(buyer.email) ?? "",
      name: [str(buyer.first_name), str(buyer.last_name)].filter(Boolean).join(" "),
    },
    items: items
      .filter((i): i is Obj => isObj(i) && i.type === "ticket" && str(i.id) !== null)
      .map((i) => ({
        id: str(i.id)!,
        amountCents: typeof i.amount === "number" ? i.amount : 0,
        email: answer(i.questions, "email"),
        name: answer(i.questions, "name"),
      })),
  };
}

/** One line per pass: the pass's own name and email, else the buyer's. */
export function passLines(p: ZeffyPayment): PassLine[] {
  return p.items.map((i) => ({
    itemId: i.id,
    email: i.email ?? p.buyer.email,
    name: i.name ?? p.buyer.name,
    amountCents: i.amountCents,
  }));
}

/** The payment id in a webhook body. Only the id is used: the payment itself is re-read from the API. */
export function webhookPaymentId(body: unknown): string | null {
  if (!isObj(body)) return null;
  const data = isObj(body.data) ? body.data : null;
  return str(data?.id) ?? (isObj(data?.object) ? str(data.object.id) : null) ?? (isObj(body.payment) ? str(body.payment.id) : null);
}
