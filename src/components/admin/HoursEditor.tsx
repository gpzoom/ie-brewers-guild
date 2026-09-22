import { useEffect, useRef, useState } from "react";
import {
  deleteHoursRow,
  deleteSpecialHoursRow,
  upsertHoursRow,
  upsertSpecialHoursRow,
} from "@/lib/hours/hours-editor.server";
import type { HoursRow, SpecialHoursRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Same ~400ms debounce as BasicsForm (this plan's Decision 6) -- an editor
// who types a time then backgrounds the tab or navigates away without
// blurring still gets an autosave attempt fired on this timer.
const SAVE_DEBOUNCE_MS = 400;

// Mirrors hours-editor.server.ts's TIME_RE/DATE_RE. Kept as separate
// client-side copies rather than importing values out of the
// ".server.ts" module -- same precedent as BasicsForm's own duplicated
// MIN_MEMBER_SINCE_YEAR -- so a malformed value never even gets
// scheduled for a save, let alone reaches the server unvalidated.
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type SaveState = { status: "idle" | "saving" | "saved" | "error"; message?: string };
const IDLE: SaveState = { status: "idle" };

function SaveIndicator({ state }: { state: SaveState }) {
  if (state.status === "idle") return null;
  if (state.status === "saving") {
    return <p className="mt-1 text-xs text-muted-foreground">Saving…</p>;
  }
  if (state.status === "saved") {
    return <p className="mt-1 text-xs text-open">Saved</p>;
  }
  return (
    <p role="alert" className="mt-1 text-xs text-danger">
      {state.message ?? "Couldn't save — try again."}
    </p>
  );
}

/**
 * Shared autosave plumbing for both the weekly-hours rows and the
 * special-hours rows -- same debounce/no-op/error-surfacing shape as
 * BasicsForm's field-level state, generalized to "one of several rows,
 * each identified by its own id" instead of "one fixed set of named
 * fields." Every save (field-level upsert or a row delete) goes through
 * `performSave`/`remove`, which are the only two places a network call is
 * made, so every failure -- update, insert, or delete -- surfaces into
 * `status` instead of being swallowed.
 */
function useRowAutosave<TRow extends { id: string }>(initialRows: TRow[]) {
  const [rows, setRows] = useState<TRow[]>(initialRows);
  const [status, setStatus] = useState<Record<string, SaveState>>({});

  // Last known persisted value per row id -- used to skip no-op saves and
  // as the base a successful patch gets merged onto. A ref, not state:
  // updating it must never itself trigger a re-render.
  const savedRef = useRef<Record<string, TRow>>(
    Object.fromEntries(initialRows.map((row) => [row.id, row])),
  );
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedStatusTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const timers = debounceTimers.current;
    const statusTimers = savedStatusTimers.current;
    return () => {
      for (const timer of Object.values(timers)) clearTimeout(timer);
      for (const timer of Object.values(statusTimers)) clearTimeout(timer);
    };
  }, []);

  function statusKey(id: string, field: string) {
    return `${id}:${field}`;
  }

  function isNoOp(id: string, patch: Partial<TRow>) {
    const saved = savedRef.current[id];
    if (!saved) return false;
    return Object.entries(patch).every(
      ([field, value]) => (saved as Record<string, unknown>)[field] === value,
    );
  }

  function performSave(
    id: string,
    field: string,
    patch: Partial<TRow>,
    save: (patch: Partial<TRow>) => Promise<unknown>,
  ) {
    if (isNoOp(id, patch)) return;
    const key = statusKey(id, field);

    if (savedStatusTimers.current[key]) {
      clearTimeout(savedStatusTimers.current[key]);
      delete savedStatusTimers.current[key];
    }
    setStatus((prev) => ({ ...prev, [key]: { status: "saving" } }));

    save(patch)
      .then(() => {
        savedRef.current = {
          ...savedRef.current,
          [id]: { ...savedRef.current[id], ...patch } as TRow,
        };
        setStatus((prev) => ({ ...prev, [key]: { status: "saved" } }));
        savedStatusTimers.current[key] = setTimeout(() => {
          setStatus((prev) => (prev[key]?.status === "saved" ? { ...prev, [key]: IDLE } : prev));
        }, 2000);
      })
      .catch((error: unknown) => {
        setStatus((prev) => ({
          ...prev,
          [key]: {
            status: "error",
            message: error instanceof Error ? error.message : "Couldn't save — try again.",
          },
        }));
      });
  }

  /** Checkbox/select-style fields: no debounce, save fires on the change itself. */
  function saveNow(
    id: string,
    field: string,
    patch: Partial<TRow>,
    save: (patch: Partial<TRow>) => Promise<unknown>,
  ) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    performSave(id, field, patch, save);
  }

  /** Text/time fields: debounce while typing... */
  function scheduleSave(
    id: string,
    field: string,
    patch: Partial<TRow>,
    save: (patch: Partial<TRow>) => Promise<unknown>,
  ) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    const key = statusKey(id, field);
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(() => {
      delete debounceTimers.current[key];
      performSave(id, field, patch, save);
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * Clears a field's pending debounced save. Every client-side validation
   * rejection calls this first -- same reasoning as BasicsForm's
   * cancelPendingSave: without it, an earlier still-valid keystroke's
   * timer keeps counting down and fires anyway, saving stale data while
   * the field shows a rejection.
   */
  function cancelPendingSave(id: string, field: string) {
    const key = statusKey(id, field);
    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
      delete debounceTimers.current[key];
    }
  }

  /** ...and flush immediately on blur, so leaving the field never waits out the timer. */
  function flushSave(
    id: string,
    field: string,
    patch: Partial<TRow>,
    save: (patch: Partial<TRow>) => Promise<unknown>,
  ) {
    cancelPendingSave(id, field);
    performSave(id, field, patch, save);
  }

  function markInvalid(id: string, field: string, message: string) {
    cancelPendingSave(id, field);
    setStatus((prev) => ({ ...prev, [statusKey(id, field)]: { status: "error", message } }));
  }

  function statusFor(id: string, field: string): SaveState {
    return status[statusKey(id, field)] ?? IDLE;
  }

  function addRow(row: TRow) {
    setRows((prev) => [...prev, row]);
    savedRef.current = { ...savedRef.current, [row.id]: row };
  }

  /** Removes a row only once the server confirms the delete -- never optimistically. */
  function remove(id: string, destroy: () => Promise<unknown>) {
    const key = statusKey(id, "_row");
    setStatus((prev) => ({ ...prev, [key]: { status: "saving" } }));
    return destroy()
      .then(() => {
        setRows((prev) => prev.filter((row) => row.id !== id));
        const next = { ...savedRef.current };
        delete next[id];
        savedRef.current = next;
      })
      .catch((error: unknown) => {
        setStatus((prev) => ({
          ...prev,
          [key]: {
            status: "error",
            message: error instanceof Error ? error.message : "Couldn't delete — try again.",
          },
        }));
      });
  }

  return {
    rows,
    saveNow,
    scheduleSave,
    flushSave,
    cancelPendingSave,
    markInvalid,
    statusFor,
    addRow,
    remove,
  };
}

function normalizeTime(value: string): string | null {
  return value === "" ? null : value;
}

/**
 * Phone layout (spec, "Layout and breakpoints"): the two time fields sit
 * side by side, and the Closed control is on its own line below them --
 * not squeezed into the same row, since a 44px checkbox target next to two
 * time inputs is where phone hour-editors usually get too cramped to tap
 * reliably.
 */
export function HoursEditor({
  memberId,
  hours,
  specialHours,
}: {
  memberId: string;
  hours: HoursRow[];
  specialHours: SpecialHoursRow[];
}) {
  const hoursAutosave = useRowAutosave<HoursRow>(hours);
  const specialAutosave = useRowAutosave<SpecialHoursRow>(specialHours);

  // Per-weekday "add row" status has no row id yet to key off of, so it
  // gets its own small state map instead of living in the hook.
  const [addRowStatus, setAddRowStatus] = useState<Record<number, SaveState>>({});
  const [addHolidayStatus, setAddHolidayStatus] = useState<SaveState>(IDLE);

  async function addRowForWeekday(weekday: number) {
    setAddRowStatus((prev) => ({ ...prev, [weekday]: { status: "saving" } }));
    try {
      const patch = { weekday, opens_at: "09:00", closes_at: "17:00", is_closed: false };
      const { id } = await upsertHoursRow({ data: { memberId, patch } });
      hoursAutosave.addRow({
        id,
        member_id: memberId,
        weekday,
        opens_at: "09:00",
        closes_at: "17:00",
        closes_next_day: false,
        is_closed: false,
      });
      setAddRowStatus((prev) => ({ ...prev, [weekday]: IDLE }));
    } catch (error) {
      setAddRowStatus((prev) => ({
        ...prev,
        [weekday]: {
          status: "error",
          message: error instanceof Error ? error.message : "Couldn't add row — try again.",
        },
      }));
    }
  }

  function removeRow(id: string) {
    return hoursAutosave.remove(id, () => deleteHoursRow({ data: { id } }));
  }

  async function addHoliday() {
    setAddHolidayStatus({ status: "saving" });
    try {
      const today = new Date().toISOString().slice(0, 10);
      const patch = { date: today, is_closed: true };
      const { id } = await upsertSpecialHoursRow({ data: { memberId, patch } });
      specialAutosave.addRow({
        id,
        member_id: memberId,
        date: today,
        is_closed: true,
        opens_at: null,
        closes_at: null,
        closes_next_day: false,
        note: null,
      });
      setAddHolidayStatus(IDLE);
    } catch (error) {
      setAddHolidayStatus({
        status: "error",
        message: error instanceof Error ? error.message : "Couldn't add row — try again.",
      });
    }
  }

  function removeSpecial(id: string) {
    return specialAutosave.remove(id, () => deleteSpecialHoursRow({ data: { id } }));
  }

  function saveHoursField(id: string, field: keyof HoursRow, value: HoursRow[keyof HoursRow]) {
    const patch = { [field]: value } as Partial<HoursRow>;
    return upsertHoursRow({ data: { memberId, id, patch } });
  }

  function saveSpecialField(
    id: string,
    field: keyof SpecialHoursRow,
    value: SpecialHoursRow[keyof SpecialHoursRow],
  ) {
    const patch = { [field]: value } as Partial<SpecialHoursRow>;
    return upsertSpecialHoursRow({ data: { memberId, id, patch } });
  }

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <h2 className="text-lg font-medium text-foreground">Weekly hours</h2>
        <div className="mt-3 space-y-4">
          {WEEKDAYS.map((label, weekday) => (
            <div key={weekday} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{label}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  disabled={addRowStatus[weekday]?.status === "saving"}
                  onClick={() => addRowForWeekday(weekday)}
                >
                  {addRowStatus[weekday]?.status === "saving" ? "Adding…" : "Add row"}
                </Button>
              </div>
              <SaveIndicator state={addRowStatus[weekday] ?? IDLE} />
              <div className="mt-2 space-y-3">
                {hoursAutosave.rows
                  .filter((row) => row.weekday === weekday)
                  .map((row) => (
                    <div key={row.id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          defaultValue={row.opens_at ?? ""}
                          disabled={row.is_closed}
                          className="h-11"
                          aria-label={`${label} opening time`}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value !== "" && !TIME_RE.test(value)) {
                              hoursAutosave.markInvalid(row.id, "opens_at", "Enter a valid time.");
                              return;
                            }
                            hoursAutosave.scheduleSave(
                              row.id,
                              "opens_at",
                              { opens_at: normalizeTime(value) },
                              (patch) =>
                                saveHoursField(
                                  row.id,
                                  "opens_at",
                                  patch.opens_at as HoursRow["opens_at"],
                                ),
                            );
                          }}
                          onBlur={(e) => {
                            const value = e.target.value;
                            if (value !== "" && !TIME_RE.test(value)) {
                              hoursAutosave.markInvalid(row.id, "opens_at", "Enter a valid time.");
                              return;
                            }
                            hoursAutosave.flushSave(
                              row.id,
                              "opens_at",
                              { opens_at: normalizeTime(value) },
                              (patch) =>
                                saveHoursField(
                                  row.id,
                                  "opens_at",
                                  patch.opens_at as HoursRow["opens_at"],
                                ),
                            );
                          }}
                        />
                        <span aria-hidden="true">–</span>
                        <Input
                          type="time"
                          defaultValue={row.closes_at ?? ""}
                          disabled={row.is_closed}
                          className="h-11"
                          aria-label={`${label} closing time`}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value !== "" && !TIME_RE.test(value)) {
                              hoursAutosave.markInvalid(row.id, "closes_at", "Enter a valid time.");
                              return;
                            }
                            hoursAutosave.scheduleSave(
                              row.id,
                              "closes_at",
                              { closes_at: normalizeTime(value) },
                              (patch) =>
                                saveHoursField(
                                  row.id,
                                  "closes_at",
                                  patch.closes_at as HoursRow["closes_at"],
                                ),
                            );
                          }}
                          onBlur={(e) => {
                            const value = e.target.value;
                            if (value !== "" && !TIME_RE.test(value)) {
                              hoursAutosave.markInvalid(row.id, "closes_at", "Enter a valid time.");
                              return;
                            }
                            hoursAutosave.flushSave(
                              row.id,
                              "closes_at",
                              { closes_at: normalizeTime(value) },
                              (patch) =>
                                saveHoursField(
                                  row.id,
                                  "closes_at",
                                  patch.closes_at as HoursRow["closes_at"],
                                ),
                            );
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove this ${label} row`}
                          onClick={() => removeRow(row.id)}
                        >
                          Remove
                        </Button>
                      </div>
                      <SaveIndicator state={hoursAutosave.statusFor(row.id, "opens_at")} />
                      <SaveIndicator state={hoursAutosave.statusFor(row.id, "closes_at")} />
                      <label className="flex min-h-11 items-center gap-2">
                        <Checkbox
                          checked={row.is_closed}
                          onCheckedChange={(checked) =>
                            hoursAutosave.saveNow(
                              row.id,
                              "is_closed",
                              { is_closed: checked === true },
                              (patch) =>
                                saveHoursField(
                                  row.id,
                                  "is_closed",
                                  patch.is_closed as HoursRow["is_closed"],
                                ),
                            )
                          }
                        />
                        <span>Closed</span>
                      </label>
                      <SaveIndicator state={hoursAutosave.statusFor(row.id, "is_closed")} />
                      <SaveIndicator state={hoursAutosave.statusFor(row.id, "_row")} />
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-foreground">Holidays &amp; one-off changes</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={addHolidayStatus.status === "saving"}
            onClick={addHoliday}
          >
            {addHolidayStatus.status === "saving" ? "Adding…" : "Add a holiday or one-off change"}
          </Button>
        </div>
        <SaveIndicator state={addHolidayStatus} />
        <div className="mt-3 space-y-3">
          {specialAutosave.rows.map((row) => (
            <div key={row.id} className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  defaultValue={row.date}
                  className="h-11"
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "") {
                      specialAutosave.markInvalid(row.id, "date", "Date can't be empty.");
                      return;
                    }
                    if (!DATE_RE.test(value)) {
                      specialAutosave.markInvalid(row.id, "date", "Enter a valid date.");
                      return;
                    }
                    // Debounced, not saveNow -- a native date input fires
                    // onChange per keystroke while a segment (e.g. the
                    // year) is still mid-edit, and each of those
                    // intermediate values is a syntactically well-formed
                    // ISO date (e.g. "0002-12-25" while typing "2026").
                    // saveNow would have persisted every one of those on
                    // its way to the real value; scheduleSave + blur-flush
                    // (below) is the same pattern the time fields in this
                    // file already use for exactly this reason.
                    specialAutosave.scheduleSave(row.id, "date", { date: value }, (patch) =>
                      saveSpecialField(row.id, "date", patch.date as SpecialHoursRow["date"]),
                    );
                  }}
                  onBlur={(e) => {
                    const value = e.target.value;
                    if (value === "") {
                      specialAutosave.markInvalid(row.id, "date", "Date can't be empty.");
                      return;
                    }
                    if (!DATE_RE.test(value)) {
                      specialAutosave.markInvalid(row.id, "date", "Enter a valid date.");
                      return;
                    }
                    specialAutosave.flushSave(row.id, "date", { date: value }, (patch) =>
                      saveSpecialField(row.id, "date", patch.date as SpecialHoursRow["date"]),
                    );
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSpecial(row.id)}
                >
                  Remove
                </Button>
              </div>
              <SaveIndicator state={specialAutosave.statusFor(row.id, "date")} />
              <SaveIndicator state={specialAutosave.statusFor(row.id, "_row")} />

              <label className="mt-2 flex min-h-11 items-center gap-2">
                <Checkbox
                  checked={row.is_closed}
                  onCheckedChange={(checked) =>
                    specialAutosave.saveNow(
                      row.id,
                      "is_closed",
                      { is_closed: checked === true },
                      (patch) =>
                        saveSpecialField(
                          row.id,
                          "is_closed",
                          patch.is_closed as SpecialHoursRow["is_closed"],
                        ),
                    )
                  }
                />
                <span>Closed</span>
              </label>
              <SaveIndicator state={specialAutosave.statusFor(row.id, "is_closed")} />

              {!row.is_closed && (
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    type="time"
                    defaultValue={row.opens_at ?? ""}
                    className="h-11"
                    aria-label="Opening time"
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value !== "" && !TIME_RE.test(value)) {
                        specialAutosave.markInvalid(row.id, "opens_at", "Enter a valid time.");
                        return;
                      }
                      specialAutosave.scheduleSave(
                        row.id,
                        "opens_at",
                        { opens_at: normalizeTime(value) },
                        (patch) =>
                          saveSpecialField(
                            row.id,
                            "opens_at",
                            patch.opens_at as SpecialHoursRow["opens_at"],
                          ),
                      );
                    }}
                    onBlur={(e) => {
                      const value = e.target.value;
                      if (value !== "" && !TIME_RE.test(value)) {
                        specialAutosave.markInvalid(row.id, "opens_at", "Enter a valid time.");
                        return;
                      }
                      specialAutosave.flushSave(
                        row.id,
                        "opens_at",
                        { opens_at: normalizeTime(value) },
                        (patch) =>
                          saveSpecialField(
                            row.id,
                            "opens_at",
                            patch.opens_at as SpecialHoursRow["opens_at"],
                          ),
                      );
                    }}
                  />
                  <span aria-hidden="true">–</span>
                  <Input
                    type="time"
                    defaultValue={row.closes_at ?? ""}
                    className="h-11"
                    aria-label="Closing time"
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value !== "" && !TIME_RE.test(value)) {
                        specialAutosave.markInvalid(row.id, "closes_at", "Enter a valid time.");
                        return;
                      }
                      specialAutosave.scheduleSave(
                        row.id,
                        "closes_at",
                        { closes_at: normalizeTime(value) },
                        (patch) =>
                          saveSpecialField(
                            row.id,
                            "closes_at",
                            patch.closes_at as SpecialHoursRow["closes_at"],
                          ),
                      );
                    }}
                    onBlur={(e) => {
                      const value = e.target.value;
                      if (value !== "" && !TIME_RE.test(value)) {
                        specialAutosave.markInvalid(row.id, "closes_at", "Enter a valid time.");
                        return;
                      }
                      specialAutosave.flushSave(
                        row.id,
                        "closes_at",
                        { closes_at: normalizeTime(value) },
                        (patch) =>
                          saveSpecialField(
                            row.id,
                            "closes_at",
                            patch.closes_at as SpecialHoursRow["closes_at"],
                          ),
                      );
                    }}
                  />
                </div>
              )}
              <SaveIndicator state={specialAutosave.statusFor(row.id, "opens_at")} />
              <SaveIndicator state={specialAutosave.statusFor(row.id, "closes_at")} />

              <div className="mt-2">
                <Label htmlFor={`note-${row.id}`}>Note (shown on the profile)</Label>
                <Input
                  id={`note-${row.id}`}
                  defaultValue={row.note ?? ""}
                  className="mt-1 h-11"
                  placeholder="e.g. Thanksgiving"
                  onChange={(e) =>
                    specialAutosave.scheduleSave(
                      row.id,
                      "note",
                      { note: e.target.value || null },
                      (patch) =>
                        saveSpecialField(row.id, "note", patch.note as SpecialHoursRow["note"]),
                    )
                  }
                  onBlur={(e) =>
                    specialAutosave.flushSave(
                      row.id,
                      "note",
                      { note: e.target.value || null },
                      (patch) =>
                        saveSpecialField(row.id, "note", patch.note as SpecialHoursRow["note"]),
                    )
                  }
                />
                <SaveIndicator state={specialAutosave.statusFor(row.id, "note")} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
