import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  refreshIcsConnectionNow,
  removeIcsConnection,
  saveIcsConnection,
} from "@/lib/events/calendar-connection.server";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { CalendarConnectionRow, CalendarPurpose } from "@/lib/supabase/types";
import { HELP_VIDEOS } from "@/data/help-videos";
import { canonicalTag } from "@/lib/events/calendar-purpose";
import { HelpVideoButton } from "@/components/admin/HelpVideoButton";

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

/** The one-time-setup-on-a-computer warning (owner, 2026-10-01). */
export function ComputerOnlyNote() {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-[11px] border-2 border-[#C2410C] bg-[#FFF4E8] px-4 py-3 text-[13px] leading-[1.5] text-ink"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-px shrink-0">
        <rect x="3" y="4" width="18" height="12" rx="1.8" stroke="#C2410C" strokeWidth="1.8" />
        <path d="M8 20h8M12 16v4" stroke="#C2410C" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <p>
        <strong className="font-semibold">Set up the link on a computer — one time only.</strong> Google
        Calendar shows a calendar's iCal link (the ICS subscription URL below) only on a computer, never in
        the phone app. Copy it there once and paste it here. After that, add and change your events on your
        phone or your computer, whichever you like.
      </p>
    </div>
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
 * calendars can publish one) -- there is no Google OAuth connect, so the
 * artboard's "Google Calendar" card maps to: a connected card for the ICS
 * link (feed host, sync tag, sync status, Refresh now, "Edit link"), or,
 * before anything is connected, the dashed "Add a calendar" row, which
 * opens the link and tag fields in place. Edit link also offers **Remove
 * calendar** (owner, 2026-09-30), confirmed first (removeIcsConnection).
 *
 * `canEdit` false (anyone but the owner -- only the owner connects the
 * calendar, spec "People and permissions"): the connected card keeps its
 * status and Refresh now, which every role may use, but loses Edit link;
 * before anything is connected it just says who can connect one.
 */
// The words that differ between the events calendar and a producer's food
// calendar (docs/member-profiles.md, "Events" > "Food calendar").
const COPY = {
  events: {
    label: "Calendar connection",
    connectedTitle: "Calendar subscription",
    addTitle: "Add a calendar",
    importing: "importing events tagged",
    tagPlaceholder: "e.g. #guild",
    nobody: "No calendar is connected. Only the profile's owner can connect one. You can still add dates by hand below.",
    removeWhat: "The events it brought in come off your profile. Events you added by hand stay.",
    hint: "Paste your calendar's ICS subscription URL. Only events with your sync tag (for example #guild) in their title or description are imported; the tag is left off on your profile. Each event's description shows on your profile too, so keep private notes out of tagged events. Deleting an event, or taking its tag off, removes it here too.",
  },
  food: {
    label: "Food calendar",
    connectedTitle: "Food calendar",
    addTitle: "Add a food calendar",
    importing: "importing vendors tagged",
    tagPlaceholder: "e.g. #food",
    nobody: "No food calendar is connected. Only the profile's owner can connect one.",
    removeWhat: "The vendor visits it brought in come off your profile, and \"Food for the next week\" goes away until you connect one again.",
    hint: "Use the same calendar link as your Events page, with a different tag, for example #food, on each vendor's visit: the vendor's name in the title, and their menu or Instagram link in the description. (If someone else books your vendors, a separate calendar works too.) Your profile shows the next 7 days; a day with no vendor says \"Bring your own food\", or \"Closed\" when your hours say you're closed.",
  },
} as const;

export function CalendarConnectionPanel({
  memberId,
  initialConnection,
  canEdit = true,
  purpose = "events",
  onRefreshed,
}: {
  memberId: string;
  initialConnection: CalendarConnectionRow | null;
  canEdit?: boolean;
  /** The events calendar, or a producer's food calendar ("Food for the next week"). */
  purpose?: CalendarPurpose;
  /** Called after Refresh now (the page's data is reloaded either way). */
  onRefreshed?: () => void;
}) {
  const copy = COPY[purpose];
  const router = useRouter();
  const fieldId = (name: string) => (purpose === "food" ? `food-${name}` : name);
  const [connection, setConnection] = useState(initialConnection);
  const [icsUrl, setIcsUrl] = useState(initialConnection?.ics_url ?? "");
  const [syncTag, setSyncTag] = useState(initialConnection?.sync_tag ?? "");
  const [refreshing, setRefreshing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
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
      const { id } = await saveIcsConnection({ data: { memberId, icsUrl, syncTag, purpose } });
      // The server saves the tag with its "#" ("food" -> "#food"); show it that way.
      const savedTag = canonicalTag(syncTag);
      setSyncTag(savedTag);
      setConnection((prev) => ({
        id,
        member_id: memberId,
        provider: "ics",
        purpose,
        google_calendar_id: null,
        ics_url: icsUrl,
        sync_tag: savedTag,
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
      // Reload the page's data (owner, 2026-09-28), so the events the sync
      // just brought in show in the list below straight away -- in /admin
      // (Edit as them), the portal and the wizard alike.
      await router.invalidate();
      onRefreshed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed — try again.");
    } finally {
      setRefreshing(false);
    }
  }

  /** "Remove calendar" (owner, 2026-09-30), confirmed first; then the page reloads without it. */
  async function onRemove() {
    if (!connection) return;
    setError(null);
    setRemoving(true);
    try {
      await removeIcsConnection({ data: { connectionId: connection.id } });
      setConnection(null);
      setIcsUrl("");
      setSyncTag("");
      setEditing(false);
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove the calendar — try again.");
    } finally {
      setRemoving(false);
    }
  }

  const connected = connection !== null;
  const showFields = canEdit && (editing || (connected && !connection.ics_url));

  if (!connected && !canEdit) {
    return (
      <section
        aria-label={copy.label}
        className="rounded-[14px] border border-dashed border-[#D3CBBD] px-6 py-4 text-[13px] text-ink-muted max-md:px-4"
      >
        {copy.nobody}
      </section>
    );
  }
  const host = feedHost(connection?.ics_url ?? null);
  // Shown verbatim: the sync matches this text literally (ics-sync.ts),
  // so adding a "#" here would suggest a different tag than the real one.
  const tag = connection?.sync_tag?.trim() ?? "";

  let statusDot = "bg-ink-subtle";
  let statusText = "Not yet synced · the site checks it automatically";
  if (connection?.sync_status === "failing") {
    statusDot = "bg-danger";
    statusText = `Last sync failed: ${connection.last_sync_error ?? "unknown error"}`;
  } else if (connection?.last_synced_at) {
    statusDot = "bg-[#4E9A4A]";
    const when =
      now === null
        ? new Date(connection.last_synced_at).toLocaleString()
        : relativeTime(connection.last_synced_at, now);
    statusText = `Last synced ${when} · the site checks it automatically`;
  }

  // One wrapper whose look changes (white card once connected, dashed row
  // before), with the header at child 0 and the fields at child 1 in both
  // states -- so the first save flipping `connected` doesn't remount the
  // inputs and steal focus mid-typing.
  return (
    <section
      aria-label={copy.label}
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
            <h2 className="font-sans text-base font-semibold text-ink">{copy.connectedTitle}</h2>
            <p className="break-words text-[13px] text-ink-muted">
              {host ?? "Subscription link"}
              {tag ? (
                <>
                  {" "}
                  · {copy.importing}{" "}
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
            {canEdit && (
              <button
                type="button"
                aria-expanded={showFields}
                className="h-11 rounded-[9px] px-[15px] text-[13px] text-ink-muted hover:bg-canvas-2 hover:text-ink"
                onClick={() => setEditing((open) => !open)}
              >
                {showFields ? "Done" : "Edit link"}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="flex flex-col gap-1">
            <h2 className="font-sans text-sm font-semibold text-ink">{copy.addTitle}</h2>
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

      {/* Google's phone app never shows a calendar's iCal link, so the link has
          to be copied on a computer (owner, 2026-10-01). Shown until a link is
          in, and whenever the link is being edited. */}
      {(!connected || showFields) && <ComputerOnlyNote />}

      <HelpVideoButton
        video={purpose === "food" ? HELP_VIDEOS.googleFoodCalendar : HELP_VIDEOS.googleEventsCalendar}
        label={
          purpose === "food"
            ? "Watch how to connect a Google Calendar for FOOD VENDORS"
            : "Watch how to connect a Google Calendar for EVENTS"
        }
      />

      {showFields && (
        <div className="flex flex-col gap-3.5 border-t border-canvas-2 pt-3.5">
          <p className="text-xs leading-[1.45] text-ink-muted">{copy.hint}</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-[7px]">
              <label htmlFor={fieldId("ics-url")} className="text-[13px] font-medium text-ink">
                ICS subscription URL
              </label>
              <input
                id={fieldId("ics-url")}
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
              <label htmlFor={fieldId("sync-tag")} className="text-[13px] font-medium text-ink">
                Sync tag
              </label>
              <input
                id={fieldId("sync-tag")}
                value={syncTag}
                onChange={(e) => setSyncTag(e.target.value)}
                onBlur={onSave}
                placeholder={copy.tagPlaceholder}
                className={inputClass}
              />
            </div>
          </div>
          {connected && (
            <button
              type="button"
              disabled={removing}
              onClick={() => setConfirmRemove(true)}
              className="h-11 self-start rounded-[9px] px-[15px] text-[13px] font-medium text-danger hover:bg-canvas-2 disabled:opacity-60"
            >
              {removing ? "Removing…" : "Remove calendar"}
            </button>
          )}
        </div>
      )}

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent className="rounded-[18px] border-0 bg-canvas p-[30px] sm:rounded-[18px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[25px] font-bold leading-[1.1] text-ink">
              Remove this calendar?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] leading-[1.5] text-ink-muted">
              {copy.removeWhat} Your Google Calendar itself isn't changed, and you can connect it
              again any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-[46px] rounded-[9px] border-[#D3CBBD] bg-transparent px-[19px] text-[14px] font-medium text-ink hover:bg-canvas-2">
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              className="h-[46px] rounded-[9px] px-6 text-[14px] font-semibold text-white"
              onClick={() => {
                setConfirmRemove(false);
                void onRemove();
              }}
            >
              Remove calendar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
