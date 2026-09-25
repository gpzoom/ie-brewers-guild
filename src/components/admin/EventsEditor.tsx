import { useState } from "react";
import {
  clearEventOverlay,
  createEvent,
  deleteEvent,
  setEventOverlay,
  toggleEventHidden,
  updateEvent,
} from "@/lib/events/events.server";
import { fromDatetimeLocalValue, toDatetimeLocalValue } from "@/lib/timezone/timezones";
import type { EventOverlayStatus, EventRow } from "@/lib/supabase/types";

const OVERLAY_OPTIONS: { value: EventOverlayStatus; label: string }[] = [
  { value: "postponed", label: "Postponed" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "canceled", label: "Canceled" },
];

// Status pills (artboard M). Postponed has no artboard color; it takes a
// neutral pill in the same shape.
const OVERLAY_PILL: Record<EventOverlayStatus, string> = {
  rescheduled: "bg-[#F5E2D0] text-[#7A4413]",
  canceled: "bg-[#F0DBD4] text-[#7A2E1C]",
  postponed: "bg-canvas-2 text-ink-muted",
};

const inputClass =
  "h-[46px] w-full rounded-[9px] border border-canvas-border bg-white px-[13px] text-sm text-ink placeholder:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30";
const fieldLabelClass = "text-[13px] font-medium text-ink";
const sectionLabelClass = "text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted";

// How long after it starts (or ends) an event still counts as "upcoming".
const UPCOMING_GRACE_MS = 6 * 60 * 60 * 1000;

function datePart(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(new Date(iso));
  } catch {
    // An unexpected timezone value -- fall back to UTC rather than crash.
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(new Date(iso));
  }
}

function timeOf(iso: string, timeZone: string) {
  return datePart(iso, timeZone, { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

function timeRange(event: EventRow, timeZone: string) {
  const start =
    event.overlay_status === "rescheduled" && event.overlay_starts_at
      ? event.overlay_starts_at
      : event.starts_at;
  if (!event.ends_at || start !== event.starts_at) return timeOf(start, timeZone);
  return `${timeOf(start, timeZone)} – ${timeOf(event.ends_at, timeZone)}`;
}

function isUpcoming(event: EventRow, now: number) {
  const latest = [event.starts_at, event.ends_at, event.overlay_starts_at]
    .filter((v): v is string => Boolean(v))
    .map((v) => new Date(v).getTime())
    .reduce((a, b) => Math.max(a, b), 0);
  return latest >= now - UPCOMING_GRACE_MS;
}

/** Reinserts a single event back into the CURRENT list rather than
 * restoring a whole-array snapshot taken before the delete started --
 * same stale-whole-array-snapshot bug already found and fixed three times
 * elsewhere in this plan (CarouselEditor.tsx's crop-autosave, commit
 * 0bd8398; CreatorLinkPanel.tsx's onRevoke, commit 77852df;
 * ReviewTray.tsx's onApprove/onReject). Restoring a snapshot here would
 * resurrect any OTHER event that was deleted (and succeeded) while this
 * one's request was still in flight. A delete's own rollback correctly
 * restores the WHOLE row (unlike onFieldChange/onOverlayChange/
 * onToggleHidden below) because deleting IS an all-fields operation --
 * there's no narrower scope to restore. */
function reinsertEvent(prev: EventRow[], event: EventRow): EventRow[] {
  if (prev.some((e) => e.id === event.id)) return prev;
  return [...prev, event].sort((a, b) =>
    a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0,
  );
}

/**
 * Picks just the given keys off `obj`. Used below to build a rollback
 * snapshot scoped to only the fields a mutation actually touches, never
 * the whole row.
 *
 * Review finding (Task 25): all four optimistic handlers used to snapshot
 * the ENTIRE EventRow before their update and roll back to that whole
 * snapshot on failure. Concrete failure this caused: a member blurs the
 * Starts field (update in flight, snapshot has is_hidden: false), then
 * checks "Hide from profile" (succeeds -- server now has it hidden), then
 * the date update fails -> a whole-row rollback would silently replace
 * the row with the stale snapshot, un-hiding an event the server has
 * actually hidden, with the checkbox visibly unchecking itself and no
 * indication anything is wrong with the hide state. Same root-cause class
 * as the ThemePicker finding from Task 24 (rolling back with a
 * stale/wrong-scope value), just per-field here instead of per-item.
 * pickFields keeps each handler's rollback scoped to exactly the fields
 * IT touched, so an unrelated field that changed via a different,
 * successful action in the meantime is never reverted.
 */
function pickFields<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const picked = {} as Pick<T, K>;
  for (const key of keys) picked[key] = obj[key];
  return picked;
}

/** Note fields left null render the event as "at your own address" (spec: venue fields are nullable). */
export function EventsEditor({
  memberId,
  initialEvents,
  memberTimezone,
}: {
  memberId: string;
  initialEvents: EventRow[];
  memberTimezone: string;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [error, setError] = useState<string | null>(null);
  // Frozen per mount so an event doesn't hop between Upcoming and Past
  // while the member is editing it.
  const [now] = useState(() => Date.now());

  async function onAdd() {
    setError(null);
    try {
      const created = await createEvent({
        data: {
          memberId,
          title: null,
          startsAt: new Date().toISOString(),
          endsAt: null,
          venueName: null,
          city: null,
          address: null,
        },
      });
      // Nothing is optimistically added before this resolves, so there's
      // no rollback to do on failure -- just surface the error.
      setEvents((prev) => [...prev, created]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add a new event — try again.");
    }
  }

  // Only copies keys actually present on `patch` -- unlike a plain object
  // literal (which would set e.g. `starts_at: undefined` for every call
  // that only patches one field), that would widen EventRow's required
  // `starts_at: string` to `string | undefined` once spread onto the
  // optimistic local copy below.
  function toEventRowPatch(
    patch: Parameters<typeof updateEvent>[0]["data"]["patch"],
  ): Partial<EventRow> {
    const rowPatch: Partial<EventRow> = {};
    if (patch.title !== undefined) rowPatch.title = patch.title;
    if (patch.startsAt !== undefined) rowPatch.starts_at = patch.startsAt;
    if (patch.endsAt !== undefined) rowPatch.ends_at = patch.endsAt;
    if (patch.venueName !== undefined) rowPatch.venue_name = patch.venueName;
    if (patch.city !== undefined) rowPatch.city = patch.city;
    if (patch.address !== undefined) rowPatch.address = patch.address;
    return rowPatch;
  }

  async function onFieldChange(
    event: EventRow,
    patch: Parameters<typeof updateEvent>[0]["data"]["patch"],
  ) {
    setError(null);
    const rowPatch = toEventRowPatch(patch);
    // Snapshot ONLY the fields this patch touches -- see pickFields' doc
    // comment for why a whole-row snapshot would be wrong here.
    const previousValues = pickFields(event, Object.keys(rowPatch) as (keyof EventRow)[]);
    setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, ...rowPatch } : e)));
    try {
      await updateEvent({ data: { id: event.id, patch } });
    } catch (err) {
      // Roll back just the patched fields to what they were before this
      // call -- otherwise a failed save (including an RLS-denied one that
      // now throws via updateEvent's row-count check) would leave the UI
      // showing a change that never actually happened server-side, or
      // worse, silently undo an unrelated field that a DIFFERENT,
      // successful action changed while this one was in flight.
      setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, ...previousValues } : e)));
      setError(err instanceof Error ? err.message : "Couldn't save that change — try again.");
    }
  }

  async function onDelete(event: EventRow) {
    setError(null);
    setEvents((prev) => prev.filter((e) => e.id !== event.id));
    try {
      await deleteEvent({ data: { id: event.id } });
    } catch (err) {
      // Roll back the optimistic removal -- otherwise a failed delete
      // (including an RLS-denied one) would leave this event silently
      // vanished from the list with no visible error.
      setEvents((prev) => reinsertEvent(prev, event));
      setError(err instanceof Error ? err.message : "Couldn't delete this event — try again.");
    }
  }

  /**
   * Handles both the status Select (status change, no newStartsAt) and
   * the "New date/time" input that appears once status is "rescheduled"
   * (same status, new newStartsAt). When switching TO "rescheduled" with
   * no explicit newStartsAt given, this falls back to whatever
   * overlay_starts_at the event already has (so re-selecting
   * "Rescheduled" after having set a date doesn't wipe it), and to
   * `undefined` (-> null server-side) otherwise, which is exactly the
   * "no new date entered yet" state the reschedule-date input then lets
   * the member fill in.
   */
  async function onOverlayChange(
    event: EventRow,
    status: EventOverlayStatus | "none",
    newStartsAt?: string,
  ) {
    setError(null);
    // Snapshot ONLY the overlay_* fields -- see pickFields' doc comment.
    // A whole-row rollback here would silently revert e.g. is_hidden or a
    // hand-edited title if either changed, via a different successful
    // action, while THIS overlay call was still in flight.
    const previousOverlay = pickFields(event, [
      "overlay_status",
      "overlay_starts_at",
      "overlay_note",
      "overlay_set_at",
    ]);

    if (status === "none") {
      setEvents((prev) =>
        prev.map((e) =>
          e.id === event.id
            ? {
                ...e,
                overlay_status: null,
                overlay_starts_at: null,
                overlay_note: null,
                overlay_set_at: null,
              }
            : e,
        ),
      );
      try {
        await clearEventOverlay({ data: { eventId: event.id } });
      } catch (err) {
        setEvents((prev) =>
          prev.map((e) => (e.id === event.id ? { ...e, ...previousOverlay } : e)),
        );
        setError(err instanceof Error ? err.message : "Couldn't clear that status — try again.");
      }
      return;
    }

    const effectiveNewStartsAt =
      status === "rescheduled" ? (newStartsAt ?? event.overlay_starts_at ?? undefined) : undefined;
    setEvents((prev) =>
      prev.map((e) =>
        e.id === event.id
          ? {
              ...e,
              overlay_status: status,
              overlay_starts_at: status === "rescheduled" ? (effectiveNewStartsAt ?? null) : null,
            }
          : e,
      ),
    );
    try {
      await setEventOverlay({
        data: { eventId: event.id, status, newStartsAt: effectiveNewStartsAt },
      });
    } catch (err) {
      setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, ...previousOverlay } : e)));
      setError(err instanceof Error ? err.message : "Couldn't set that status — try again.");
    }
  }

  async function onToggleHidden(event: EventRow) {
    setError(null);
    // Snapshot ONLY is_hidden -- see pickFields' doc comment.
    const previousIsHidden = event.is_hidden;
    const next = !previousIsHidden;
    setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, is_hidden: next } : e)));
    try {
      await toggleEventHidden({ data: { eventId: event.id, isHidden: next } });
    } catch (err) {
      setEvents((prev) =>
        prev.map((e) => (e.id === event.id ? { ...e, is_hidden: previousIsHidden } : e)),
      );
      setError(err instanceof Error ? err.message : "Couldn't update that setting — try again.");
    }
  }

  function sourceLabel(event: EventRow) {
    return event.source === "manual" ? "added by hand" : "from your calendar";
  }

  function renderEvent(event: EventRow) {
    const status = event.overlay_status;
    const canceled = status === "canceled";
    const isManual = event.source === "manual";
    const heading =
      event.title || event.venue_name || (isManual ? "Untitled event" : "Calendar event");
    const where = [event.title ? event.venue_name : null, event.city].filter(Boolean).join(", ");
    const dateIso =
      status === "rescheduled" && event.overlay_starts_at
        ? event.overlay_starts_at
        : event.starts_at;

    return (
      <li
        key={event.id}
        className={`flex flex-col gap-3 rounded-[12px] border px-[18px] py-[15px] max-md:px-4 ${
          canceled ? "border-canvas-2 bg-[#F2EEE7]" : "border-canvas-border bg-white"
        }`}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-[18px]">
          <div className="flex min-w-0 flex-1 items-center gap-[18px]">
            <div className="flex w-[52px] shrink-0 flex-col items-center" aria-hidden="true">
              <span
                className={`text-[10px] uppercase tracking-[0.1em] ${canceled ? "text-ink-subtle" : "text-ink-muted"}`}
              >
                {datePart(dateIso, memberTimezone, { weekday: "short" })}
              </span>
              <span
                className={`font-display text-[23px] font-bold leading-[1.05] ${canceled ? "text-ink-subtle" : "text-ink"}`}
              >
                {datePart(dateIso, memberTimezone, { day: "numeric" })}
              </span>
              <span className="text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
                {datePart(dateIso, memberTimezone, { month: "short" })}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-[9px]">
                <span
                  className={`text-[15px] font-semibold ${canceled ? "text-ink-muted" : "text-ink"}`}
                >
                  {heading}
                </span>
                {status && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${OVERLAY_PILL[status]}`}
                  >
                    {status}
                  </span>
                )}
                {event.is_hidden && (
                  <span className="rounded-full border border-canvas-border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    Hidden
                  </span>
                )}
              </div>
              {canceled ? (
                <p className="text-[13px] text-ink-subtle">
                  Still shown on your profile, struck through, so people know it's off.
                </p>
              ) : (
                <p className="text-[13px] text-ink-muted">
                  <span className="sr-only">
                    {datePart(dateIso, memberTimezone, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}{" "}
                    ·{" "}
                  </span>
                  {[where, timeRange(event, memberTimezone), sourceLabel(event)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {status === "rescheduled" && (
                <div className="flex flex-wrap items-center gap-2.5">
                  <label htmlFor={`reschedule-${event.id}`} className="text-xs text-ink-muted">
                    New date &amp; time
                  </label>
                  <input
                    id={`reschedule-${event.id}`}
                    type="datetime-local"
                    defaultValue={
                      event.overlay_starts_at
                        ? toDatetimeLocalValue(event.overlay_starts_at, memberTimezone)
                        : ""
                    }
                    className="h-10 rounded-[8px] border border-canvas-border bg-white px-[11px] text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
                    onBlur={(e) => {
                      // Same empty-value guard as the Starts field below.
                      if (!e.target.value) return;
                      onOverlayChange(
                        event,
                        "rescheduled",
                        fromDatetimeLocalValue(e.target.value, memberTimezone),
                      );
                    }}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-1.5 md:w-[190px]">
            <label
              htmlFor={`overlay-${event.id}`}
              className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle"
            >
              Status
            </label>
            <select
              id={`overlay-${event.id}`}
              value={status ?? "none"}
              onChange={(e) =>
                onOverlayChange(event, e.target.value as EventOverlayStatus | "none")
              }
              className={`h-11 rounded-[9px] border border-canvas-border px-[11px] text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 ${
                status === "rescheduled" || status === "postponed"
                  ? "bg-[#FCF3EA] font-medium"
                  : "bg-white"
              }`}
            >
              <option value="none">Going ahead</option>
              {OVERLAY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-canvas-2 pt-3">
          {isManual && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="flex flex-col gap-[7px]">
                <label htmlFor={`title-${event.id}`} className={fieldLabelClass}>
                  Title (optional)
                </label>
                <input
                  id={`title-${event.id}`}
                  defaultValue={event.title ?? ""}
                  className={inputClass}
                  onBlur={(e) => onFieldChange(event, { title: e.target.value || null })}
                />
              </div>
              <div className="flex flex-col gap-[7px]">
                <label htmlFor={`starts-${event.id}`} className={fieldLabelClass}>
                  Starts
                </label>
                <input
                  id={`starts-${event.id}`}
                  type="datetime-local"
                  defaultValue={toDatetimeLocalValue(event.starts_at, memberTimezone)}
                  className={inputClass}
                  onBlur={(e) => {
                    // A cleared/incomplete datetime-local input reports
                    // "" -- parsing that would throw uncaught, outside
                    // any try/catch, since it happens before
                    // onFieldChange's own try block even starts.
                    // Guarding here means clearing the field is just a
                    // no-op (the input keeps its last real value on the
                    // next render) rather than a silent crash.
                    if (!e.target.value) return;
                    onFieldChange(event, {
                      startsAt: fromDatetimeLocalValue(e.target.value, memberTimezone),
                    });
                  }}
                />
              </div>
              <div className="flex flex-col gap-[7px]">
                <label htmlFor={`venue-${event.id}`} className={fieldLabelClass}>
                  Venue
                </label>
                <input
                  id={`venue-${event.id}`}
                  defaultValue={event.venue_name ?? ""}
                  aria-describedby={`venue-help-${event.id}`}
                  className={inputClass}
                  onBlur={(e) => onFieldChange(event, { venueName: e.target.value || null })}
                />
                <p id={`venue-help-${event.id}`} className="text-xs text-ink-subtle">
                  Leave blank for your own address
                </p>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={event.is_hidden}
                onChange={() => onToggleHidden(event)}
                className="size-[18px] accent-ink"
              />
              Hide from profile
            </label>
            {isManual && (
              <button
                type="button"
                className="ml-auto h-11 rounded-[9px] px-[15px] text-[13px] text-ink-muted hover:bg-canvas-2 hover:text-danger"
                onClick={() => onDelete(event)}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </li>
    );
  }

  // Manual events are always listed (past ones too, so they stay
  // editable/deletable). Synced events are listed while upcoming, so a
  // status can be set on them -- the spec's "status overlay on each
  // synced event"; their details come from the calendar and aren't
  // edited here.
  const sorted = [...events].sort((a, b) =>
    a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0,
  );
  const upcoming = sorted.filter((event) => isUpcoming(event, now));
  const past = sorted.filter((event) => event.source === "manual" && !isUpcoming(event, now));

  return (
    <section aria-labelledby="events-upcoming-label" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 id="events-upcoming-label" className={`font-sans ${sectionLabelClass}`}>
          Upcoming
        </h2>
        <button
          type="button"
          className="min-h-11 rounded-[9px] px-3 text-[13px] font-medium text-brand hover:bg-canvas-2 hover:text-brand-hover"
          onClick={onAdd}
        >
          + Add one by hand
        </button>
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}

      {upcoming.length === 0 ? (
        <p className="rounded-[12px] border border-canvas-border bg-white px-[18px] py-[15px] text-[13px] text-ink-muted">
          Nothing coming up yet. Connect a calendar above, or add an event by hand.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">{upcoming.map(renderEvent)}</ul>
      )}

      {past.length > 0 && (
        <>
          <h2 className={`mt-3 font-sans ${sectionLabelClass}`}>Past (added by hand)</h2>
          <ul className="flex flex-col gap-3">{past.map(renderEvent)}</ul>
        </>
      )}
    </section>
  );
}
