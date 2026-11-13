import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import type { MemberAlertItem } from "@/lib/guild/member-alerts";
import { editAsThem } from "@/components/guild/edit-as-them";

const lightButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-canvas-border bg-canvas px-[17px] text-[13px] font-medium text-ink no-underline transition-colors hover:bg-canvas-2 disabled:opacity-60";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function AlertCard({ alert }: { alert: MemberAlertItem }) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);

  async function handleEdit() {
    setOpening(true);
    try {
      await editAsThem(router, alert.editMemberId, alert.editPath);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start editing as this member.");
      setOpening(false);
    }
  }

  return (
    <li
      className={`flex flex-wrap items-start justify-between gap-x-6 gap-y-3 rounded-xl border border-canvas-border bg-white p-4 ${
        alert.history ? "opacity-70" : ""
      }`}
    >
      <div className="flex min-w-0 max-w-[640px] flex-col gap-1">
        <div className="text-[15px] font-semibold text-ink">{alert.memberName}</div>
        <div className="text-[13px] text-ink">{alert.typeLabel}</div>
        {(alert.otherMemberName || alert.eventTitle) && (
          <div className="text-[13px] text-[#564E45]">
            {[alert.eventTitle, alert.otherMemberName].filter(Boolean).join(" · ")}
          </div>
        )}
        <div className="text-[12px] text-text-muted">
          {formatDate(alert.date)} · {alert.age}
        </div>
        {alert.launchLabel && (
          <span className="mt-1 w-fit rounded-full bg-canvas-2 px-2.5 py-[3px] text-[11px] font-semibold text-ink-muted">
            {alert.launchLabel}
          </span>
        )}
      </div>
      <button type="button" onClick={handleEdit} disabled={opening} className={lightButtonClass}>
        {opening ? "Opening…" : "Edit as them"}
      </button>
    </li>
  );
}

/** The Guild's Member alerts list: open and unread first, then the last 30 days of resolved and read. */
export function MemberAlertsTable({ alerts }: { alerts: MemberAlertItem[] }) {
  const current = alerts.filter((a) => !a.history);
  const history = alerts.filter((a) => a.history);
  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex max-w-[640px] flex-col gap-1.5">
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.01em] text-ink">
          Member alerts
        </h1>
        <p className="text-pretty text-[13px] text-[#564E45]">
          Problems and messages for every member. Resolved and read items stay for 30 days.
        </p>
      </div>
      {alerts.length === 0 ? (
        <p className="text-[14px] text-text-muted">No member alerts. Nothing needs attention.</p>
      ) : (
        <>
          {current.length > 0 && (
            <section aria-label="Open and unread" className="flex flex-col gap-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                Open and unread ({current.length})
              </h2>
              <ul className="flex flex-col gap-3">
                {current.map((a) => (
                  <AlertCard key={a.id} alert={a} />
                ))}
              </ul>
            </section>
          )}
          {history.length > 0 && (
            <section aria-label="Resolved and read" className="flex flex-col gap-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                Resolved and read, last 30 days
              </h2>
              <ul className="flex flex-col gap-3">
                {history.map((a) => (
                  <AlertCard key={a.id} alert={a} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
