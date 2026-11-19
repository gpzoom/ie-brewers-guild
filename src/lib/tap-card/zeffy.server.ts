import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { parseZeffyPayment, type ZeffyPayment } from "@/lib/tap-card/zeffy";
import { recordZeffyPayment, type RecordResult } from "@/lib/tap-card/trail-pass-core";
import { trailPassStore } from "@/lib/tap-card/trail-pass-store.server";

/** Zeffy's read-only API, with the owner's key (Worker secret ZEFFY_API_KEY). Never logs buyer data. */
const ZEFFY_API = "https://api.zeffy.com/api/v1";

async function zeffyKey(): Promise<string> {
  const { env } = await import("cloudflare:workers");
  const key = (env as { ZEFFY_API_KEY?: string }).ZEFFY_API_KEY;
  if (!key) throw new Error("Missing ZEFFY_API_KEY in the Worker environment.");
  return key;
}

async function zeffyGet(path: string): Promise<Response> {
  return fetch(`${ZEFFY_API}${path}`, { headers: { Authorization: `Bearer ${await zeffyKey()}` } });
}

export async function zeffyGetPayment(id: string): Promise<ZeffyPayment | null> {
  const res = await zeffyGet(`/payments/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Zeffy payment lookup failed (${res.status}).`);
  return parseZeffyPayment(await res.json());
}

/** Every payment for a campaign since a time, newest pages followed via starting_after. */
export async function zeffyPaymentsSince(campaignId: string, since: Date): Promise<ZeffyPayment[]> {
  const out: ZeffyPayment[] = [];
  let after: string | null = null;
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ campaign: campaignId, limit: "100", "created[gte]": String(Math.floor(since.getTime() / 1000)) });
    if (after) q.set("starting_after", after);
    const res = await zeffyGet(`/payments?${q}`);
    if (!res.ok) throw new Error(`Zeffy payment list failed (${res.status}).`);
    const body = (await res.json()) as { data?: unknown[]; has_more?: boolean; next_cursor?: string | null };
    for (const raw of body.data ?? []) {
      const p = parseZeffyPayment(raw);
      if (p) out.push(p);
    }
    if (!body.has_more || !body.next_cursor) break;
    after = body.next_cursor;
  }
  return out;
}

/** Re-reads the payment from Zeffy (never trusting a webhook body) and records it. */
export async function recordPaymentById(id: string): Promise<RecordResult | null> {
  const payment = await zeffyGetPayment(id);
  if (!payment) return null;
  const service = await getSupabaseServiceRoleClient();
  return recordZeffyPayment(trailPassStore(service), payment, new Date());
}
