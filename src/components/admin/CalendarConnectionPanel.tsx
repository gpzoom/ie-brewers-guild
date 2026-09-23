import { useState } from "react";
import { refreshIcsConnectionNow, saveIcsConnection } from "@/lib/events/calendar-connection.server";
import type { CalendarConnectionRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CalendarConnectionPanel({ memberId, initialConnection }: { memberId: string; initialConnection: CalendarConnectionRow | null }) {
  const [connection, setConnection] = useState(initialConnection);
  const [icsUrl, setIcsUrl] = useState(initialConnection?.ics_url ?? "");
  const [syncTag, setSyncTag] = useState(initialConnection?.sync_tag ?? "");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(err instanceof Error ? err.message : "Couldn't save the calendar connection — try again.");
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

  return (
    <section>
      <h2 className="text-lg font-medium text-foreground">Calendar sync (ICS)</h2>
      <p className="text-xs text-muted-foreground">
        Paste your calendar's public ICS subscription URL. Only events whose title or category contains your sync tag
        are imported.
      </p>
      <div className="mt-3 max-w-md space-y-3">
        <div>
          <Label htmlFor="ics-url">ICS subscription URL</Label>
          <Input id="ics-url" value={icsUrl} onChange={(e) => setIcsUrl(e.target.value)} className="mt-1 h-11" onBlur={onSave} />
        </div>
        <div>
          <Label htmlFor="sync-tag">Sync tag</Label>
          <Input id="sync-tag" value={syncTag} onChange={(e) => setSyncTag(e.target.value)} className="mt-1 h-11" placeholder="e.g. guild" onBlur={onSave} />
        </div>
        {connection && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {connection.sync_status === "failing"
                ? `Last sync failed: ${connection.last_sync_error}`
                : connection.last_synced_at
                  ? `Last synced ${new Date(connection.last_synced_at).toLocaleString()}`
                  : "Not yet synced"}
            </span>
            <Button type="button" variant="outline" size="sm" className="h-9" disabled={refreshing} onClick={onRefreshNow}>
              {refreshing ? "Refreshing…" : "Refresh now"}
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
