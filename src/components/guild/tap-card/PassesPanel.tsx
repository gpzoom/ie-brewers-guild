import { useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { assignPassToMember, saveTrailCampaign, type PassReport } from "@/lib/tap-card/trail-pass-admin.server";
import { StatusMessage, cardClass, darkButtonClass, errorText, fieldClass, outlineButtonClass, type Message } from "@/components/guild/settings-ui";

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

const thClass = "px-3 py-3 font-semibold first:pl-5 last:pr-5";
const tdClass = "px-3 py-3 first:pl-5 last:pr-5";

/** Guild > Tap Card > Passes: Beer Trail Pass sales, commission owed per brewery, and the Zeffy campaign for each year. */
export function PassesPanel({ report, onYearChange }: { report: PassReport; onYearChange: (year: number) => void }) {
  const router = useRouter();
  const [message, setMessage] = useState<Message>(null);
  const current = report.campaigns.find((c) => c.year === report.year);
  const [form, setForm] = useState({
    year: String(current?.year ?? report.year),
    zeffyCampaignId: current?.zeffyCampaignId ?? "",
    formUrl: current?.formUrl ?? "",
    commissionPct: String(current?.commissionPct ?? 50),
  });
  const [assign, setAssign] = useState<Record<string, string>>({});

  async function run(action: () => Promise<unknown>, ok: string) {
    setMessage(null);
    try {
      await action();
      setMessage({ kind: "ok", text: ok });
      await router.invalidate();
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    }
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    await run(
      () =>
        saveTrailCampaign({
          data: { year: Number(form.year), zeffyCampaignId: form.zeffyCampaignId, formUrl: form.formUrl, commissionPct: Number(form.commissionPct) },
        }),
      "Saved.",
    );
  }

  const totals = report.rows.reduce((t, r) => ({ sold: t.sold + r.sold, gross: t.gross + r.grossCents, owed: t.owed + (r.memberId ? r.commissionCents : 0) }), {
    sold: 0,
    gross: 0,
    owed: 0,
  });

  return (
    <div className="flex flex-col gap-[22px]">
      <p className="max-w-[640px] text-[13px] text-ink-muted">
        Beer Trail Passes are sold through Zeffy. A pass bought from a brewery&rsquo;s counter plate is credited to that brewery, and the
        brewery earns its commission on it. Refunded passes don&rsquo;t count.
      </p>
      {report.campaigns.length > 1 && (
        <label className="flex items-center gap-2 text-[13px] text-ink">
          Trail year
          <select className={`${fieldClass} w-auto`} value={report.year} onChange={(e) => onYearChange(Number(e.target.value))}>
            {report.campaigns.map((c) => (
              <option key={c.year} value={c.year}>
                {c.year}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="text-[14px] text-ink">
        {report.year}: <strong>{totals.sold}</strong> {totals.sold === 1 ? "pass" : "passes"} sold, {money(totals.gross)} in sales,{" "}
        <strong>{money(totals.owed)}</strong> commission owed to breweries.
      </p>
      <div className="overflow-x-auto rounded-[14px] border border-canvas-border bg-white">
        <table className="w-full min-w-[620px] text-left text-[13px] text-ink">
          <thead className="border-b border-[#E6E0D6] bg-[#FCFAF6] text-[11px] uppercase tracking-[0.06em] text-ink-muted">
            <tr>
              <th className={thClass}>Month</th>
              <th className={thClass}>Brewery</th>
              <th className={thClass}>Sold</th>
              <th className={thClass}>Refunded</th>
              <th className={thClass}>Sales</th>
              <th className={thClass}>Commission</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-ink-muted">
                  No passes sold yet.
                </td>
              </tr>
            )}
            {report.rows.map((r) => (
              <tr key={`${r.month}-${r.memberId ?? "none"}`} className="border-b border-[#EFEAE1] last:border-0">
                <td className={tdClass}>{monthName(r.month)}</td>
                <td className={tdClass}>{r.memberName ?? <span className="text-ink-muted">No brewery (see below)</span>}</td>
                <td className={tdClass}>{r.sold}</td>
                <td className={tdClass}>{r.refunded}</td>
                <td className={tdClass}>{money(r.grossCents)}</td>
                <td className={tdClass}>{r.memberId ? money(r.commissionCents) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.unassigned.length > 0 && (
        <section className={cardClass}>
          <h2 className="font-display text-[16px] font-bold text-ink">Passes with no brewery</h2>
          <p className="text-[13px] text-ink-muted">
            These were bought without a counter plate, or with a different email on Zeffy. If you know which brewery sold one, credit it here.
          </p>
          <ul className="flex flex-col gap-3">
            {report.unassigned.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 border-t border-[#EFEAE1] pt-3 text-[13px] text-ink sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {p.holderName} ({p.holderEmail}) · {new Date(p.paidAt).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })} · {money(p.amountCents)}
                  {p.refunded && " · refunded"}
                </span>
                <span className="flex gap-2">
                  <select
                    className={`${fieldClass} w-auto`}
                    value={assign[p.id] ?? ""}
                    onChange={(e) => setAssign((a) => ({ ...a, [p.id]: e.target.value }))}
                    aria-label={`Brewery for ${p.holderName}`}
                  >
                    <option value="">Choose a brewery…</option>
                    {report.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={outlineButtonClass}
                    disabled={!assign[p.id]}
                    onClick={() => run(() => assignPassToMember({ data: { passId: p.id, memberId: assign[p.id] } }), "Credited.")}
                  >
                    Credit
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form onSubmit={onSave} className={cardClass}>
        <h2 className="font-display text-[16px] font-bold text-ink">Zeffy campaign</h2>
        <p className="text-[13px] text-ink-muted">
          One Zeffy membership form per trail year. The site sells the soonest year that hasn&rsquo;t ended. For a new year, enter that
          year with its new Zeffy form.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">
            Trail year
            <input className={fieldClass} inputMode="numeric" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">
            Commission (%)
            <input className={fieldClass} inputMode="numeric" value={form.commissionPct} onChange={(e) => setForm({ ...form, commissionPct: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink sm:col-span-2">
            Zeffy form link
            <input className={fieldClass} value={form.formUrl} onChange={(e) => setForm({ ...form, formUrl: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink sm:col-span-2">
            Zeffy campaign ID
            <input className={fieldClass} value={form.zeffyCampaignId} onChange={(e) => setForm({ ...form, zeffyCampaignId: e.target.value })} />
          </label>
        </div>
        <button type="submit" className={`${darkButtonClass} w-fit`}>
          Save
        </button>
      </form>
      <StatusMessage message={message} />
    </div>
  );
}
