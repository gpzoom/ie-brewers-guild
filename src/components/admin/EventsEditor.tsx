import { useState } from "react";
import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import {
  clearEventOverlay,
  createEvent,
  deleteEvent,
  setEventOverlay,
  toggleEventHidden,
  updateEvent,
} from "@/lib/events/events.server";
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

const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

/**
 * `event.starts_at` is a UTC ISO timestamp from the database. Formatting
 * it with plain `Date` getters (or slicing the ISO string directly) would
 * report wall-clock time in the BROWSER's own local timezone, not the
 * member's business timezone (`members.timezone`) -- wrong the moment a
 * member edits their schedule from a device set to a different timezone
 * than their business (traveling, a different device, etc.), silently
 * shifting every event time by the difference with no error shown.
 * `TZDate` reports its getters in the given IANA zone instead of the
 * system one, so combining it with `format` produces the wall-clock
 * string the `datetime-local` input actually wants, in the RIGHT zone.
 */
function toDatetimeLocalValue(isoUtc: string, memberTimezone: string): string {
  return format(new TZDate(isoUtc, memberTimezone), DATETIME_LOCAL_FORMAT);
}

/**
 * The inverse of toDatetimeLocalValue: a `datetime-local` input's value is
 * a naive "yyyy-MM-ddTHH:mm" string with no offset.
 *
 * IMPORTANT: `new TZDate(value, memberTimezone)` -- i.e. TZDate's
 * single-STRING constructor form -- is NOT actually timezone-aware for a
 * naive string like this one. Per @date-fns/tz's own source
 * (node_modules/@date-fns/tz/date/mini.js's constructor), a string
 * argument falls straight through to `+new Date(str)`, and ECMA-262
 * specifies that a date-time string with no timezone designator is
 * parsed as local time in the CURRENT SYSTEM timezone -- exactly the
 * browser-timezone bug this function exists to avoid. Verified
 * empirically: constructing `new TZDate("2026-10-05T18:00",
 * "America/Los_Angeles")` produces a DIFFERENT instant depending on the
 * system's own timezone (checked against America/New_York, UTC,
 * Asia/Tokyo, and America/Los_Angeles as the system zone), even though
 * the member-timezone argument never changes -- i.e. the single-string
 * form reintroduces the exact bug it looks like it fixes.
 *
 * TZDate's NUMERIC multi-argument constructor form (`new TZDate(year,
 * monthIndex, day, hours, minutes, memberTimezone)`) goes through a
 * different path (`adjustToSystemTZ`) that correctly reconciles the
 * given wall-clock components against the target zone regardless of the
 * system timezone -- verified to produce the identical instant across
 * all 4 system zones above. So the datetime-local value's components are
 * parsed out and passed as separate numeric args, never as one naive
 * string.
 */
function fromDatetimeLocalValue(value: string, memberTimezone: string): string {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);
  return new TZDate(year, month - 1, day, hours, minutes, memberTimezone).toISOString();
}

/** Reinserts a single event back into the CURRENT list rather than
 * restoring a whole-array snapshot taken before the delete started --
 * same stale-whole-array-snapshot bug already found and fixed three times
 * elsewhere in this plan (CarouselEditor.tsx's crop-autosave, commit
 * 0bd8398; CreatorLinkPanel.tsx's onRevoke, commit 77852df;
 * ReviewTray.tsx's onApprove/onReject). Restoring a snapshot here would
 * resurrect any OTHER event that was deleted (and succeeded) while this
 * one's request was still in flight. */
function reinsertEvent(prev: EventRow[], event: EventRow): EventRow[] {
  if (prev.some((e) => e.id === event.id)) return prev;
  return [...prev, event].sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0));
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
        data: { memberId, startsAt: new Date().toISOString(), endsAt: null, venueName: null, city: null, address: null },
      });
      // Nothing is optimistically added before this resolves, so there's
      // no rollback to do on failure -- just surface the error.
      setEvents((prev) => [...prev, created]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add a new event — try again.");
    }
  }

  async function onFieldChange(event: EventRow, patch: Parameters<typeof updateEvent>[0]["data"]["patch"]) {
    setError(null);
    // Snapshot only THIS event (as passed in, before the optimistic
    // update below), not the whole `events` array -- see reinsertEvent's
    // doc comment for why a whole-array snapshot would be wrong here too.
    const previous = event;
    setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, ...toEventRowPatch(patch) } : e)));
    try {
      await updateEvent({ data: { id: event.id, patch } });
    } catch (err) {
      // Roll back this one event to what it was before this call --
      // otherwise a failed save (including an RLS-denied one that now
      // throws via updateEvent's row-count check) would leave the UI
      // showing a change that never actually happened server-side.
      setEvents((prev) => prev.map((e) => (e.id === event.id ? previous : e)));
      setError(err instanceof Error ? err.message : "Couldn't save that change — try again.");
    }
  }

  // Only copies keys actually present on `patch` -- unlike a plain object
  // literal (which would set e.g. `starts_at: undefined` for every call
  // that only patches one field), that would widen EventRow's required
  // `starts_at: string` to `string | undefined` once spread onto the
  // optimistic local copy below.
  function toEventRowPatch(patch: Parameters<typeof updateEvent>[0]["data"]["patch"]): Partial<EventRow> {
    const rowPatch: Partial<EventRow> = {};
    if (patch.startsAt !== undefined) rowPatch.starts_at = patch.startsAt;
    if (patch.endsAt !== undefined) rowPatch.ends_at = patch.endsAt;
    if (patch.venueName !== undefined) rowPatch.venue_name = patch.venueName;
    if (patch.city !== undefined) rowPatch.city = patch.city;
    if (patch.address !== undefined) rowPatch.address = patch.address;
    return rowPatch;
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

  async function onOverlayChange(event: EventRow, status: EventOverlayStatus | "none") {
    setError(null);
    const previous = event;
    if (status === "none") {
      setEvents((prev) =>
        prev.map((e) =>
          e.id === event.id ? { ...e, overlay_status: null, overlay_starts_at: null, overlay_note: null, overlay_set_at: null } : e,
        ),
      );
      try {
        await clearEventOverlay({ data: { eventId: event.id } });
      } catch (err) {
        setEvents((prev) => prev.map((e) => (e.id === event.id ? previous : e)));
        setError(err instanceof Error ? err.message : "Couldn't clear that status — try again.");
      }
      return;
    }
    setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, overlay_status: status } : e)));
    try {
      await setEventOverlay({ data: { eventId: event.id, status } });
    } catch (err) {
      setEvents((prev) => prev.map((e) => (e.id === event.id ? previous : e)));
      setError(err instanceof Error ? err.message : "Couldn't set that status — try again.");
    }
  }

  async function onToggleHidden(event: EventRow) {
    setError(null);
    const previous = event;
    const next = !event.is_hidden;
    setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, is_hidden: next } : e)));
    try {
      await toggleEventHidden({ data: { eventId: event.id, isHidden: next } });
    } catch (err) {
      setEvents((prev) => prev.map((e) => (e.id === event.id ? previous : e)));
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`starts-${event.id}`}>Starts</Label>
                  <Input
                    id={`starts-${event.id}`}
                    type="datetime-local"
                    defaultValue={toDatetimeLocalValue(event.starts_at, memberTimezone)}
                    className="mt-1 h-11"
                    onBlur={(e) => onFieldChange(event, { startsAt: fromDatetimeLocalValue(e.target.value, memberTimezone) })}
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
