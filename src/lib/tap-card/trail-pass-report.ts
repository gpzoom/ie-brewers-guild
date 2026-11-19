import { TZDate } from "@date-fns/tz";
import { TAP_CARD_TZ } from "@/lib/tap-card/tap-card-time";

/** Beer Trail Pass commission per brewery per Pacific month (spec 2026-11-19). Refunds don't earn. */
export type PassRow = { memberId: string | null; amountCents: number; paidAt: string; refundedAt: string | null };
export type CommissionRow = { month: string; memberId: string | null; sold: number; refunded: number; grossCents: number; commissionCents: number };

function pacificMonth(iso: string): string {
  const d = new TZDate(new Date(iso).getTime(), TAP_CARD_TZ);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthlyCommission(rows: PassRow[], pct: number): CommissionRow[] {
  const groups = new Map<string, CommissionRow>();
  for (const r of rows) {
    const month = pacificMonth(r.paidAt);
    const key = `${month}|${r.memberId ?? ""}`;
    const g = groups.get(key) ?? { month, memberId: r.memberId, sold: 0, refunded: 0, grossCents: 0, commissionCents: 0 };
    if (r.refundedAt) g.refunded += 1;
    else {
      g.sold += 1;
      g.grossCents += r.amountCents;
    }
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, commissionCents: Math.round((g.grossCents * pct) / 100) }))
    .sort(
      (a, b) =>
        b.month.localeCompare(a.month) ||
        Number(a.memberId === null) - Number(b.memberId === null) ||
        (a.memberId ?? "").localeCompare(b.memberId ?? ""),
    );
}
