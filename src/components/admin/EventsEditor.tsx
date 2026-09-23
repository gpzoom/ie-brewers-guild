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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const OVERLAY_OPTIONS: { value: EventOverlayStatus; label: string }[] = [
  { value: "postponed", label: "Postponed" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "canceled", label: "Canceled" },
];

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
  return [...prev, event].sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0));
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
 * ticks "Hide from profile" (succeeds -- server now has it hidden), then
 * the date update fails -> a whole-row rollback would silently replace
 * the row with the stale snapshot, un-hiding an event the server has
 * actually hidden, with the checkbox visibly un-ticking itself and no
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
  function toEventRowPatch(patch: Parameters<typeof updateEvent>[0]["data"]["patch"]): Partial<EventRow> {
    const rowPatch: Partial<EventRow> = {};
    if (patch.title !== undefined) rowPatch.title = patch.title;
    if (patch.startsAt !== undefined) rowPatch.starts_at = patch.startsAt;
    if (patch.endsAt !== undefined) rowPatch.ends_at = patch.endsAt;
    if (patch.venueName !== undefined) rowPatch.venue_name = patch.venueName;
    if (patch.city !== undefined) rowPatch.city = patch.city;
    if (patch.address !== undefined) rowPatch.address = patch.address;
    return rowPatch;
  }

  async function onFieldChange(event: EventRow, patch: Parameters<typeof updateEvent>[0]["data"]["patch"]) {
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
  async function onOverlayChange(event: EventRow, status: EventOverlayStatus | "none", newStartsAt?: string) {
    setError(null);
    // Snapshot ONLY the overlay_* fields -- see pickFields' doc comment.
    // A whole-row rollback here would silently revert e.g. is_hidden or a
    // hand-edited title if either changed, via a different successful
    // action, while THIS overlay call was still in flight.
    const previousOverlay = pickFields(event, ["overlay_status", "overlay_starts_at", "overlay_note", "overlay_set_at"]);

    if (status === "none") {
      setEvents((prev) =>
        prev.map((e) =>
          e.id === event.id
            ? { ...e, overlay_status: null, overlay_starts_at: null, overlay_note: null, overlay_set_at: null }
            : e,
        ),
      );
      try {
        await clearEventOverlay({ data: { eventId: event.id } });
      } catch (err) {
        setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, ...previousOverlay } : e)));
        setError(err instanceof Error ? err.message : "Couldn't clear that status — try again.");
      }
      return;
    }

    const effectiveNewStartsAt = status === "rescheduled" ? newStartsAt ?? event.overlay_starts_at ?? undefined : undefined;
    setEvents((prev) =>
      prev.map((e) =>
        e.id === event.id
          ? { ...e, overlay_status: status, overlay_starts_at: status === "rescheduled" ? effectiveNewStartsAt ?? null : null }
          : e,
      ),
    );
    try {
      await setEventOverlay({ data: { eventId: event.id, status, newStartsAt: effectiveNewStartsAt } });
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
      setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, is_hidden: previousIsHidden } : e)));
      setError(err instanceof Error ? err.message : "Couldn't update that setting — try again.");
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-foreground">Events</h2>
        <Button type="button" className="h-11" onClick={onAdd}>
          Add an event
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      <ul className="mt-4 space-y-4">
        {events
          .filter((event) => event.source === "manual")
          .map((event) => (
            <li key={event.id} className="rounded-md border border-border p-3">
              <div>
                <Label htmlFor={`title-${event.id}`}>Title (optional)</Label>
                <Input
                  id={`title-${event.id}`}
                  defaultValue={event.title ?? ""}
                  className="mt-1 h-11"
                  onBlur={(e) => onFieldChange(event, { title: e.target.value || null })}
                />
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`starts-${event.id}`}>Starts</Label>
                  <Input
                    id={`starts-${event.id}`}
                    type="datetime-local"
                    defaultValue={toDatetimeLocalValue(event.starts_at, memberTimezone)}
                    className="mt-1 h-11"
                    onBlur={(e) => {
                      // A cleared/incomplete datetime-local input reports
                      // "" -- parsing that would throw uncaught, outside
                      // any try/catch, since it happens before
                      // onFieldChange's own try block even starts.
                      // Guarding here means clearing the field is just a
                      // no-op (the input keeps its last real value on the
                      // next render) rather than a silent crash.
                      if (!e.target.value) return;
                      onFieldChange(event, { startsAt: fromDatetimeLocalValue(e.target.value, memberTimezone) });
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor={`venue-${event.id}`}>Venue (leave blank for your own address)</Label>
                  <Input
                    id={`venue-${event.id}`}
                    defaultValue={event.venue_name ?? ""}
                    className="mt-1 h-11"
                    onBlur={(e) => onFieldChange(event, { venueName: e.target.value || null })}
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div>
                  <Label htmlFor={`overlay-${event.id}`}>Status</Label>
                  <Select defaultValue={event.overlay_status ?? "none"} onValueChange={(value) => onOverlayChange(event, value as EventOverlayStatus | "none")}>
                    <SelectTrigger id={`overlay-${event.id}`} className="mt-1 h-11 w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Normal</SelectItem>
                      {OVERLAY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {event.overlay_status === "rescheduled" && (
                  <div>
                    <Label htmlFor={`reschedule-${event.id}`}>New date/time</Label>
                    <Input
                      id={`reschedule-${event.id}`}
                      type="datetime-local"
                      defaultValue={event.overlay_starts_at ? toDatetimeLocalValue(event.overlay_starts_at, memberTimezone) : ""}
                      className="mt-1 h-11"
                      onBlur={(e) => {
                        // Same empty-value guard as the Starts field above.
                        if (!e.target.value) return;
                        onOverlayChange(event, "rescheduled", fromDatetimeLocalValue(e.target.value, memberTimezone));
                      }}
                    />
                  </div>
                )}

                <label className="flex min-h-11 items-center gap-2">
                  <Checkbox checked={event.is_hidden} onCheckedChange={() => onToggleHidden(event)} />
                  <span>Hide from profile</span>
                </label>

                <Button type="button" variant="ghost" size="sm" className="ml-auto h-9" onClick={() => onDelete(event)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
      </ul>
    </section>
  );
}
