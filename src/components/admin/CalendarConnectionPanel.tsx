import { useEffect, useState } from "react";
import {
  refreshIcsConnectionNow,
  saveIcsConnection,
} from "@/lib/events/calendar-connection.server";
import type { CalendarConnectionRow } from "@/lib/supabase/types";

const inputClass =
  "h-[46px] w-full rounded-[9px] border border-canvas-border bg-white px-[13px] text-sm text-ink placeholder:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30";
const secondaryButtonClass =
  "flex h-11 shrink-0 items-center gap-[9px] rounded-[9px] border border-[#D3CBBD] bg-canvas px-[17px] text-[13px] font-semibold text-ink hover:bg-canvas-2 disabled:opacity-60";

function CalendarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="3" y="4.5" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3 9h16M7.5 2.8v3.4M14.5 2.8v3.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.2 6.6A5.4 5.4 0 0 0 3.4 5.2M2.8 9.4a5.4 5.4 0 0 0 9.8 1.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M13.6 3.2v3.4h-3.4M2.4 12.8V9.4h3.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function feedHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function relativeTime(iso: string, now: number): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  const abs = Math.abs(seconds);
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86400), "day");
}

/**
 * The calendar connection block of artboard M (AdminEvents). The app's
 * only connection type is an ICS subscription link (Apple and most other
 * calendars can publish one) -- there is no Google OAuth connect and no
 * disconnect endpoint, so the artboard's "Google Calendar" card and
 * Disconnect button map to: a connected card for the ICS link (feed host,
 * sync tag, sync status, Refresh now, "Edit link"), or, before anything
 * is connected, the dashed "Add an Apple or other calendar" row, which
 * opens the link and tag fields in place.
 */
export function CalendarConnectionPanel({
  memberId,
  initialConnection,
}: {
  memberId: string;
  initialConnection: CalendarConnectionRow | null;
}) {
  const [connection, setConnection] = useState(initialConnection);
  const [icsUrl, setIcsUrl] = useState(initialConnection?.ics_url ?? "");
  const [syncTag, setSyncTag] = useState(initialConnection?.sync_tag ?? "");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether the link/tag fields are open. Stays open after the first
  // successful save (which flips `connection` from null to a row) so the
  // member isn't bounced out of the form between the two fields.
  const [editing, setEditing] = useState(false);
  // Relative "4 minutes ago" text is only computed on the client (after
  // mount) so the server render and hydration agree; until then the
  // absolute timestamp is shown, as before.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  /**
   * Awaits before updating state -- no premature optimistic update, so
   * there's nothing to roll back on failure. But `saveIcsConnection` can
   * throw (the new URL-scheme rejection, an RLS-denied-write row-count
   * error, or a plain network/Postgres error), and without a catch here
   * that would be a silent, invisible failure -- the input would just sit
   * there with no feedback at all. Same try/catch + visible role="alert"
   * message shape as CoverEditor.tsx's onChooseAsset / PublishGateDialog's
   * onPublish/onUnpublish.
   *
   * Both inputs share this same onBlur handler, and a member simply
   * clicking into then back out of either field -- with nothing typed in
   * either -- fires onBlur with both still empty. Without the early return
   * below, that would call saveIcsConnection with an empty icsUrl and show
   * "That doesn't look like a valid URL" to someone who hasn't done
   * anything wrong yet.
   */
  async function onSave() {
    if (icsUrl.trim() === "" && syncTag.trim() === "") return;
    setError(null);
    try {
      const { id } = await saveIcsConnection({ data: { memberId, icsUrl, syncTag } });
      setConnection((prev) => ({
        id,
        member_id: memberId,
        provider: "ics",
        google_calendar_id: null,
        ics_url: icsUrl,
        sync_tag: syncTag,
        last_synced_at: prev?.last_synced_at ?? null,
        last_sync_error: null,
        sync_status: "ok",
      }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't save the calendar connection — try again.",
      );
    }
  }

  /**
   * try/catch/finally around the refresh call -- the brief's given shape
   * (`setRefreshing(true)`, await with no catch, then `setRefreshing(false)`)
   * leaves the button stuck showing "Refreshing…" forever if the await
   * throws, since the line that flips it back never runs. `finally` makes
   * setRefreshing(false) run unconditionally regardless of success or
   * failure, and the catch surfaces a real, visible error instead of an
   * unhandled rejection.
   *
   * `refreshIcsConnectionNow` always resolves (never throws) once it's
   * successfully found the connection row, because syncOneIcsConnection
   * swallows every sync failure into sync_status/last_sync_error rather
   * than throwing -- so a plain `{ok: true}` return would make a broken
   * feed (typo'd URL, a 404/503, ...) look identical to a successful
   * refresh: no error shown here, and the stale "Not yet synced"/old
   * last-synced text left on screen until a later page reload. Reading
   * the row `refreshIcsConnectionNow` now returns and applying it to
   * `connection` state makes a failed sync show up immediately via the
   * existing `sync_status === "failing"` branch below.
   */
  async function onRefreshNow() {
    if (!connection) return;
    setError(null);
    setRefreshing(true);
    try {
      const refreshed = await refreshIcsConnectionNow({ data: { connectionId: connection.id } });
      setConnection(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed — try again.");
    } finally {
      setRefreshing(false);
    }
  }

  const connected = connection !== null;
  const showFields = editing || (connected && !connection.ics_url);
  const host = feedHost(connection?.ics_url ?? null);
  // Shown verbatim: the sync matches this text literally (ics-sync.ts),
  // so adding a "#" here would suggest a different tag than the real one.
  const tag = connection?.sync_tag?.trim() ?? "";

  let statusDot = "bg-ink-subtle";
  let statusText = "Not yet synced · refreshes automatically every 15 minutes";
  if (connection?.sync_status === "failing") {
    statusDot = "bg-danger";
    statusText = `Last sync failed: ${connection.last_sync_error ?? "unknown error"}`;
  } else if (connection?.last_synced_at) {
    statusDot = "bg-[#4E9A4A]";
    const when =
      now === null
        ? new Date(connection.last_synced_at).toLocaleString()
        : relativeTime(connection.last_synced_at, now);
    statusText = `Last synced ${when} · refreshes automatically every 15 minutes`;
  }

  // One wrapper whose look changes (white card once connected, dashed row
  // before), with the header at child 0 and the fields at child 1 in both
  // states -- so the first save flipping `connected` doesn't remount the
  // inputs and steal focus mid-typing.
  return (
    <section
      aria-label="Calendar connection"
      className={
        connected
          ? "flex flex-col gap-3.5 rounded-[14px] border border-canvas-border bg-white px-6 py-[22px] max-md:px-4"
          : "flex flex-col gap-4 rounded-[14px] border border-dashed border-[#D3CBBD] px-6 py-4 max-md:px-4"
      }
    >
      {connected ? (
        <div className="flex flex-col items-start gap-4 md:flex-row">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-[11px] bg-canvas-2 text-ink-muted max-md:hidden">
            <CalendarIcon />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
            <h2 className="font-sans text-base font-semibold text-ink">Calendar subscription</h2>
            <p className="break-words text-[13px] text-ink-muted">
              {host ?? "Subscription link"}
              {tag ? (
                <>
                  {" "}
                  · importing events tagged{" "}
                  <strong className="font-semibold text-ink">{tag}</strong>
                </>
              ) : (
                " · add a sync tag — nothing is imported without one"
              )}
            </p>
            <p className="flex items-start gap-2 pt-[3px] text-xs text-ink-muted">
              <span
                className={`mt-[3px] block size-2 shrink-0 rounded-full ${statusDot}`}
                aria-hidden="true"
              />
              <span className="break-words">{statusText}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={refreshing}
              onClick={onRefreshNow}
            >
              <RefreshIcon />
              {refreshing ? "Refreshing…" : "Refresh now"}
            </button>
            <button
              type="button"
              aria-expanded={showFields}
              className="h-11 rounded-[9px] px-[15px] text-[13px] text-ink-muted hover:bg-canvas-2 hover:text-ink"
              onClick={() => setEditing((open) => !open)}
            >
              {showFields ? "Done" : "Edit link"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="flex flex-col gap-1">
            <h2 className="font-sans text-sm font-semibold text-ink">
              Add an Apple or other calendar
            </h2>
            <p className="text-xs leading-[1.45] text-ink-muted">
              Calendars connect by subscription link (ICS), which your calendar app updates on its
              own schedule — expect dates to appear here a little behind your calendar.
            </p>
          </div>
          {editing ? (
            <button
              type="button"
              className="h-11 shrink-0 rounded-[9px] px-[15px] text-[13px] text-ink-muted hover:bg-canvas-2 hover:text-ink"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              className={`${secondaryButtonClass} font-medium`}
              onClick={() => setEditing(true)}
            >
              Add calendar
            </button>
          )}
        </div>
      )}

      {showFields && (
        <div className="flex flex-col gap-3.5 border-t border-canvas-2 pt-3.5">
          <p className="text-xs leading-[1.45] text-ink-muted">
            Paste your calendar's public ICS subscription URL. Only events whose title or category
            contains your sync tag are imported.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-[7px]">
              <label htmlFor="ics-url" className="text-[13px] font-medium text-ink">
                ICS subscription URL
              </label>
              <input
                id="ics-url"
                type="url"
                inputMode="url"
                value={icsUrl}
                onChange={(e) => setIcsUrl(e.target.value)}
                onBlur={onSave}
                placeholder="https://…"
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-[7px]">
              <label htmlFor="sync-tag" className="text-[13px] font-medium text-ink">
                Sync tag
              </label>
              <input
                id="sync-tag"
                value={syncTag}
                onChange={(e) => setSyncTag(e.target.value)}
                onBlur={onSave}
                placeholder="e.g. guild"
                className={inputClass}
              />
            </div>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
