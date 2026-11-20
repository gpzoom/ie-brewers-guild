import { useEffect, useState } from "react";
import { getMemberPassSummary, type MemberPassSummary } from "@/lib/tap-card/trail-pass-admin.server";
import { money, monthName } from "@/components/guild/tap-card/PassesPanel";

const colHeading = "text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted";

/** Portal/Admin > Scan Pass: Beer Trail Passes sold at this brewery's counter, commission, and email opt-ins (counts only). */
export function TapCardPassesCard({ memberId }: { memberId: string }) {
  const [summary, setSummary] = useState<MemberPassSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMemberPassSummary({ data: { memberId } })
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your pass sales."));
  }, [memberId]);

  return (
    <section className="flex flex-col gap-4 rounded-[14px] border border-canvas-border bg-white px-4 py-5 md:px-6" aria-labelledby="tap-card-passes">
      <h2 id="tap-card-passes" className="font-display text-[18px] font-bold text-ink">
        Beer Trail Passes
      </h2>
      <p className="text-[13px] text-ink-muted">
        When a customer joins the Beer Trail from your counter plate, the sale is credited to you and you earn a commission. The Guild
        pays commissions; these are your running totals.
      </p>
      {summary && (
        <div className="grid gap-6 md:grid-cols-2 md:gap-0 md:divide-x md:divide-[#EFEAE1]">
          <div className="flex flex-col gap-3 md:pr-6">
            <h3 className={colHeading}>Passes sold</h3>
            {summary.rows.length === 0 ? (
              <p className="text-[14px] text-ink">No passes sold at your counter yet.</p>
            ) : (
              <table className="w-full text-left text-[14px] text-ink">
                <thead className="text-[12px] text-ink-muted">
                  <tr>
                    <th className="pb-2 font-medium">Month</th>
                    <th className="pb-2 text-right font-medium">Sold</th>
                    <th className="pb-2 text-right font-medium">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((r) => (
                    <tr key={r.month} className="border-t border-[#EFEAE1]">
                      <td className="py-2 font-medium">{monthName(r.month)}</td>
                      <td className="py-2 text-right">
                        {r.sold}
                        {r.refunded > 0 && <span className="block text-[12px] text-ink-muted">{r.refunded} refunded</span>}
                      </td>
                      <td className="py-2 text-right">{money(r.commissionCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex flex-col gap-3 md:pl-6">
            <h3 className={colHeading}>Your email list</h3>
            <p className="font-display text-[32px] font-bold leading-none text-ink">{summary.subscribers}</p>
            <p className="text-[13px] text-ink-muted">
              {summary.subscribers === 1 ? "customer has" : "customers have"} agreed to get your emails when they joined at your counter.
            </p>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
