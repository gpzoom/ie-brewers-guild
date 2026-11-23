import { useEffect, useRef, useState } from "react";
import {
  getStaffActivity,
  getStaffActivityList,
  type ActivityItem,
  type ActivityRange,
  type ActivitySummary,
} from "@/lib/tap-card/staff-activity.server";
import { STAFF_CODES_OWNER_ONLY } from "@/lib/tap-card/staff-codes";
import {
  ACTIVITY_RANGES,
  FLAG_ORDER,
  eventLabel,
  flagText,
  formatActivityDay,
  formatActivityTime,
  isActivityEmpty,
  methodLabel,
  personName,
  totalsText,
} from "@/lib/tap-card/staff-activity-text";
import type { FlagKind } from "@/lib/tap-card/staff-activity";

const fieldClass =
  "h-11 min-w-0 rounded-[9px] border border-canvas-border bg-white px-3 text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const outlineClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-[#D3CBBD] bg-canvas px-[15px] text-[13px] font-medium text-ink hover:bg-canvas-2 disabled:opacity-60";
const rowButtonClass =
  "flex w-full flex-col gap-1 rounded-[9px] px-2 py-2.5 text-left hover:bg-canvas-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:flex-row md:items-baseline md:gap-4";

function errorText(err: unknown) {
  return err instanceof Error ? err.message : "That didn't load. Refresh the page.";
}

/** An answer, and the range and version it was for. */
type Answer = { range: ActivityRange; staffVersion: number; summary: ActivitySummary | null; error: string | null };
type Open = { key: string; items: ActivityItem[]; more: boolean; loading: boolean; error: string | null };

/**
 * Portal/Admin > Scan Pass > Staff activity (spec 2026-11-23): check-ins and
 * rewards by person, with flags worth a look. Owners, co-owners and Guild
 * admins only: hidden on the server's refusal. Give it a key of the member;
 * `staffVersion` changes when names or codes do.
 */
export function StaffActivityCard({ memberId, staffVersion }: { memberId: string; staffVersion: number }) {
  const [range, setRange] = useState<ActivityRange>(30);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [refused, setRefused] = useState(false);
  const [open, setOpen] = useState<Open | null>(null);
  /** Goes up whenever the open row, range or member changes, so a late list never lands on the wrong row. */
  const listToken = useRef(0);

  function refuse() {
    setAnswer(null);
    setOpen(null);
    setRefused(true);
  }

  useEffect(() => {
    let current = true;
    listToken.current++;
    setOpen(null);
    getStaffActivity({ data: { memberId, range } })
      .then((s) => {
        if (current) setAnswer({ range, staffVersion, summary: s, error: null });
      })
      .catch((err) => {
        if (!current) return;
        const message = errorText(err);
        if (message === STAFF_CODES_OWNER_ONLY) refuse();
        else setAnswer({ range, staffVersion, summary: null, error: message });
      });
    return () => {
      current = false;
    };
  }, [memberId, range, staffVersion]);

  function fetchList(key: string, offset: number) {
    const token = ++listToken.current;
    getStaffActivityList({ data: { memberId, range, key, offset } })
      .then((page) => {
        if (token !== listToken.current) return;
        setOpen((o) => {
          if (!o || o.key !== key) return o;
          const seen = new Set(o.items.map((i) => i.id));
          return { ...o, items: [...o.items, ...page.items.filter((i) => !seen.has(i.id))], more: page.more, loading: false, error: null };
        });
      })
      .catch((err) => {
        if (token !== listToken.current) return;
        const message = errorText(err);
        if (message === STAFF_CODES_OWNER_ONLY) refuse();
        else setOpen((o) => (o && o.key === key ? { ...o, loading: false, error: message } : o));
      });
  }

  function toggle(key: string) {
    if (open?.key === key) {
      listToken.current++;
      setOpen(null);
      return;
    }
    setOpen({ key, items: [], more: false, loading: true, error: null });
    fetchList(key, 0);
  }

  function showMore() {
    if (!open) return;
    setOpen({ ...open, loading: true, error: null });
    fetchList(open.key, open.items.length);
  }

  function onRange(value: string) {
    setRange(value === "all" ? "all" : (Number(value) as ActivityRange));
  }

  // Hidden until the first answer, in case it's a refusal.
  if (refused || !answer) return null;

  // Never show one range's answer under another.
  const shown = answer.range === range && answer.staffVersion === staffVersion ? answer : null;
  const summary = shown?.summary ?? null;
  const error = shown?.error ?? null;
  const empty = summary !== null && isActivityEmpty(summary);
  const now = new Date();

  return (
    <section className="flex flex-col gap-4 rounded-[14px] border border-canvas-border bg-white px-4 py-5 md:px-6" aria-labelledby="staff-activity">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="staff-activity" className="font-display text-[18px] font-bold text-ink">
          Staff activity
        </h2>
        <select aria-label="Range" className={fieldClass} value={String(range)} onChange={(e) => onRange(e.target.value)}>
          {ACTIVITY_RANGES.map((r) => (
            <option key={String(r.value)} value={String(r.value)}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <p className="text-[13px] text-ink-muted">
        A flag means it's worth a look. It isn't proof of anything. Busy nights and private events can cause one. Open hours use your
        hours as posted now, so changing them can change older flags.
      </p>
      {!shown && (
        <p role="status" className="text-[13px] text-ink-muted">
          Loading...
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
      {summary && empty && <p className="text-[14px] text-ink-muted">No activity in this range.</p>}
      {summary && !empty && (
        <ul className="flex flex-col">
          {summary.rows.map((row, i) => {
            const isOpen = open?.key === row.key;
            const panelId = `staff-activity-${i}`;
            return (
              <li key={row.key} className="border-t border-canvas-border pt-1">
                <button type="button" className={rowButtonClass} aria-expanded={isOpen} aria-controls={isOpen ? panelId : undefined} onClick={() => toggle(row.key)}>
                  <span className="min-w-[10rem] text-[14px] font-semibold text-ink">{personName(row.name, row.removed)}</span>
                  <span className="text-[13px] text-ink">{totalsText(row)}</span>
                  <FlagCounts flags={row.flags} />
                </button>
                {isOpen && open && (
                  <div id={panelId} className="px-2 pb-3">
                    <ActivityList open={open} rowKey={row.key} onMore={showMore} />
                  </div>
                )}
              </li>
            );
          })}
          {summary.beforeTracking > 0 && (
            <li className="flex flex-col gap-1 border-t border-canvas-border px-2 py-2.5 md:flex-row md:items-baseline md:gap-4">
              <span className="min-w-[10rem] text-[14px] font-semibold text-ink">Before tracking</span>
              <span className="text-[13px] text-ink">
                {summary.beforeTracking} {summary.beforeTracking === 1 ? "visit" : "visits"}
              </span>
            </li>
          )}
        </ul>
      )}
      {summary && summary.wrongTries.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-canvas-border pt-3">
          <h3 className="text-[14px] font-semibold text-ink">Wrong code tries</h3>
          <ul className="flex flex-col gap-1">
            {summary.wrongTries.map((w) => (
              <li key={`${w.customer}|${w.day}`} className="text-[13px] text-ink">
                {w.customer} · {formatActivityDay(w.day, now)} · {w.tries} tries
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function FlagCounts({ flags }: { flags: Partial<Record<FlagKind, number>> }) {
  const shown = FLAG_ORDER.filter((k) => (flags[k] ?? 0) > 0);
  if (shown.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-x-3 text-[13px] text-ink">
      {shown.map((k) => (
        <span key={k}>
          <span aria-hidden="true">⚠ </span>
          {flagText(k, flags[k])}
        </span>
      ))}
    </span>
  );
}

function ActivityList({ open, rowKey, onMore }: { open: Open; rowKey: string; onMore: () => void }) {
  const now = new Date();
  return (
    <div className="flex flex-col gap-2">
      {open.items.length === 0 && !open.loading && !open.error && <p className="text-[13px] text-ink-muted">Nothing to show.</p>}
      <ul className="flex flex-col">
        {open.items.map((item) => {
          const method = methodLabel(item.method, item.event, rowKey);
          return (
            <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-canvas-border py-2 text-[13px] text-ink">
              <span className="font-medium">{formatActivityTime(item.at, now)}</span>
              <span>{item.customer}</span>
              <span>{eventLabel(item.event)}</span>
              {method && <span className="text-ink-muted">{method}</span>}
              {item.reward && <span>{item.reward}</span>}
              {item.flags.map((f) => (
                <span key={f}>
                  <span aria-hidden="true">⚠ </span>
                  {flagText(f)}
                </span>
              ))}
            </li>
          );
        })}
      </ul>
      {open.loading && <p role="status" className="text-[13px] text-ink-muted">Loading...</p>}
      {open.error && (
        <p role="alert" className="text-[13px] text-danger">
          {open.error}
        </p>
      )}
      {open.more && !open.loading && (
        <div>
          <button type="button" className={outlineClass} onClick={onMore}>
            Show more
          </button>
        </div>
      )}
    </div>
  );
}
