import { useState, type FormEvent } from "react";
import type { AuditFilter, AuditLogView } from "@/lib/guild/audit-log-view.server";

const fieldLabelClass = "text-[12px] font-medium text-ink";
const fieldClass =
  "h-11 w-full min-w-0 rounded-[9px] border border-canvas-border bg-white px-3 font-sans text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const lightButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-canvas-border bg-canvas px-[17px] text-[13px] font-medium text-ink transition-colors hover:bg-canvas-2";
const darkButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-ink bg-ink px-[17px] text-[13px] font-semibold text-canvas transition-colors hover:bg-ink/85";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

/**
 * The super admin's Audit log (docs/member-profiles.md, "Super admin";
 * docs/design/README.md has the layout notes -- no artboard exists, so it
 * follows the inquiries screen): read-only, newest first, filterable by
 * member, person and date. A change made while editing as a member reads
 * "[person], editing as [member]". Times are the Guild's (Pacific).
 */
export function AuditLogScreen({
  view,
  filter,
  onFilterChange,
}: {
  view: AuditLogView;
  filter: AuditFilter;
  onFilterChange: (filter: AuditFilter) => void;
}) {
  const [draft, setDraft] = useState<AuditFilter>(filter);
  const hasFilter = Boolean(filter.memberId || filter.actorUserId || filter.from || filter.to);

  function apply(event: FormEvent) {
    event.preventDefault();
    onFilterChange(draft);
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex max-w-[640px] flex-col gap-1.5">
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.01em] text-ink">
          Audit log
        </h1>
        <p className="text-pretty text-[13px] text-[#564E45]">
          Who did what, and when: every change made while editing as a member, member deletions, and
          Guild admin access. Read only. Only you, the super admin, see this page.
        </p>
      </div>

      <form
        onSubmit={apply}
        aria-label="Filter the audit log"
        className="grid grid-cols-1 gap-3 rounded-[14px] border border-canvas-border bg-white px-4 py-4 sm:grid-cols-2 md:px-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
      >
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>Member</span>
          <select
            value={draft.memberId ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, memberId: e.target.value || undefined }))}
            className={fieldClass}
          >
            <option value="">All members</option>
            {view.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>Person</span>
          <select
            value={draft.actorUserId ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, actorUserId: e.target.value || undefined }))}
            className={fieldClass}
          >
            <option value="">Everyone</option>
            {view.people.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.email ?? "Unknown address"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>From</span>
          <input
            type="date"
            value={draft.from ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value || undefined }))}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>To</span>
          <input
            type="date"
            value={draft.to ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value || undefined }))}
            className={fieldClass}
          />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className={darkButtonClass}>
            Show
          </button>
          {hasFilter && (
            <button
              type="button"
              onClick={() => {
                setDraft({});
                onFilterChange({});
              }}
              className={lightButtonClass}
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {view.entries.length === 0 ? (
        <div className="rounded-[14px] border border-canvas-border bg-white px-6 py-8 text-center text-sm text-ink-muted">
          {hasFilter ? "Nothing matches these filters." : "Nothing has been logged yet."}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-[14px] border border-canvas-border bg-white">
          {view.entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-1 border-b border-[#F0EBE3] px-4 py-3 last:border-b-0 md:flex-row md:items-baseline md:gap-5 md:px-5"
            >
              <span className="shrink-0 text-[12px] text-ink-muted md:w-[170px]">
                {formatWhen(entry.createdAt)}
              </span>
              <span className="min-w-0 flex-1 text-[14px] text-ink">
                <span className="break-all font-semibold">{entry.actorEmail ?? "Unknown person"}</span>
                {entry.editingAs && entry.memberName && (
                  <span className="text-ink-muted">, editing as {entry.memberName}</span>
                )}
                {!entry.editingAs && entry.memberName && (
                  <span className="text-ink-muted"> ({entry.memberName})</span>
                )}
                <span className="block text-[13px] text-[#3A332C] md:mt-0.5">{entry.description}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {view.truncated && (
        <p className="text-[12px] text-ink-muted">
          Showing the newest {view.entries.length}. Narrow the dates or pick a member to see older ones.
        </p>
      )}
    </div>
  );
}
