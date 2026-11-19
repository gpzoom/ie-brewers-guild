import { useEffect, useState } from "react";
import { getMemberPassSummary, type MemberPassSummary } from "@/lib/tap-card/trail-pass-admin.server";
import { money, monthName } from "@/components/guild/tap-card/PassesPanel";

/** Portal/Admin > Tap Card: Beer Trail Passes sold at this brewery's counter, commission, and email opt-ins (counts only). */
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
        <>
          {summary.rows.length === 0 ? (
            <p className="text-[14px] text-ink">No passes sold at your counter yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-[14px] text-ink">
              {summary.rows.map((r) => (
                <li key={r.month} className="flex flex-wrap justify-between gap-2 border-t border-[#EFEAE1] pt-2 first:border-0 first:pt-0">
                  <span className="font-medium">{monthName(r.month)}</span>
                  <span>
                    {r.sold} sold{r.refunded > 0 ? ` (${r.refunded} refunded)` : ""} · commission {money(r.commissionCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[14px] text-ink">
            <strong>{summary.subscribers}</strong> {summary.subscribers === 1 ? "person has" : "people have"} agreed to get your emails.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
