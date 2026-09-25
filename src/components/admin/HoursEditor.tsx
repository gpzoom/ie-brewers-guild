import { useEffect, useRef, useState } from "react";
import {
  deleteHoursRow,
  deleteSpecialHoursRow,
  upsertHoursRow,
  upsertSpecialHoursRow,
} from "@/lib/hours/hours-editor.server";
import type { HoursRow, SpecialHoursRow } from "@/lib/supabase/types";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  IDLE,
  type SaveState,
  SaveIndicator,
  fieldLabelClass,
  secondaryButtonClass,
  sectionLabelClass,
  textInputClass,
} from "@/components/admin/basics/ui";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Display order only (artboard AdminBasics lists Monday first); the stored
// weekday numbers are unchanged (0 = Sunday).
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

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

type TimeField = "opens_at" | "closes_at";

/**
 * Time input look from artboard AdminBasics: 124px x 44px on desktop,
 * filling the row on a phone (artboard AdminPhone). A closed row's inputs
 * go to the artboard's muted "closed" fill.
 */
const timeInputClass =
  "h-[46px] min-w-0 flex-1 rounded-[10px] border-canvas-border bg-white px-[11px] text-[14px] text-ink shadow-none md:h-11 md:w-[124px] md:flex-none md:rounded-[9px] md:px-3 md:text-[14px] disabled:cursor-not-allowed disabled:border-canvas-2 disabled:bg-[#F2EEE7] disabled:text-ink-subtle disabled:opacity-100";

const checkboxClass = "h-[17px] w-[17px] shrink-0 cursor-pointer accent-ink";

const iconButtonClass =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[9px] text-ink-muted transition-colors hover:bg-canvas-2 hover:text-ink disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

const textLinkButtonClass =
  "inline-flex min-h-11 items-center self-start text-[13px] font-medium text-brand underline-offset-2 hover:text-brand-hover hover:underline disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

/**
 * Weekly hours laid out like artboard AdminBasics: one line per day --
 * 84px day label, opening time, "to", closing time, Closed checkbox --
 * with any additional shifts for that day stacked under the first and an
 * "Add another shift" link under them. On a phone (artboard AdminPhone)
 * the label shrinks to a 42px short name, the two times fill the row, and
 * Closed + remove wrap onto their own line below the times rather than
 * squeezing a 44px target beside two time inputs.
 *
 * Holidays and one-off changes (special hours) follow as their own
 * section, each a white card in the same language.
 *
 * Renders two sibling sections (a fragment) so the parent page's own
 * section gap spaces them.
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

  /**
   * One handler for a weekly row's time field, on change (debounced) or
   * on blur (flushed) -- identical validation and save path to before,
   * just written once instead of four times.
   */
  function onHoursTime(row: HoursRow, field: TimeField, value: string, mode: "schedule" | "flush") {
    if (value !== "" && !TIME_RE.test(value)) {
      hoursAutosave.markInvalid(row.id, field, "Enter a valid time.");
      return;
    }
    const patch = { [field]: normalizeTime(value) } as Partial<HoursRow>;
    const save = (p: Partial<HoursRow>) =>
      saveHoursField(row.id, field, p[field] as HoursRow[TimeField]);
    if (mode === "schedule") hoursAutosave.scheduleSave(row.id, field, patch, save);
    else hoursAutosave.flushSave(row.id, field, patch, save);
  }

  function onSpecialTime(
    row: SpecialHoursRow,
    field: TimeField,
    value: string,
    mode: "schedule" | "flush",
  ) {
    if (value !== "" && !TIME_RE.test(value)) {
      specialAutosave.markInvalid(row.id, field, "Enter a valid time.");
      return;
    }
    const patch = { [field]: normalizeTime(value) } as Partial<SpecialHoursRow>;
    const save = (p: Partial<SpecialHoursRow>) =>
      saveSpecialField(row.id, field, p[field] as SpecialHoursRow[TimeField]);
    if (mode === "schedule") specialAutosave.scheduleSave(row.id, field, patch, save);
    else specialAutosave.flushSave(row.id, field, patch, save);
  }

  function onSpecialDate(row: SpecialHoursRow, value: string, mode: "schedule" | "flush") {
    if (value === "") {
      specialAutosave.markInvalid(row.id, "date", "Date can't be empty.");
      return;
    }
    if (!DATE_RE.test(value)) {
      specialAutosave.markInvalid(row.id, "date", "Enter a valid date.");
      return;
    }
    // Debounced on change, not saveNow -- a native date input fires
    // onChange per keystroke while a segment (e.g. the year) is still
    // mid-edit, and each of those intermediate values is a syntactically
    // well-formed ISO date (e.g. "0002-12-25" while typing "2026").
    // saveNow would have persisted every one of those on its way to the
    // real value; scheduleSave + blur-flush is the same pattern the time
    // fields use for exactly this reason.
    const save = (patch: Partial<SpecialHoursRow>) =>
      saveSpecialField(row.id, "date", patch.date as SpecialHoursRow["date"]);
    if (mode === "schedule") specialAutosave.scheduleSave(row.id, "date", { date: value }, save);
    else specialAutosave.flushSave(row.id, "date", { date: value }, save);
  }

  return (
    <>
      <section className="flex flex-col gap-[10px] md:gap-3" aria-labelledby="weekly-hours-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="weekly-hours-heading" className={cn(sectionLabelClass, "font-sans")}>
            Weekly hours
          </h2>
          <p className="text-[12px] text-ink-subtle">Shown on your page as day chips</p>
        </div>

        <div className="flex flex-col gap-2">
          {DISPLAY_ORDER.map((weekday) => {
            const label = WEEKDAYS[weekday];
            const dayRows = hoursAutosave.rows.filter((row) => row.weekday === weekday);
            const adding = addRowStatus[weekday]?.status === "saving";
            return (
              <div
                key={weekday}
                role="group"
                aria-label={label}
                className="flex items-start gap-[9px] md:gap-[14px]"
              >
                <div
                  className={cn(
                    "flex min-h-[46px] w-[42px] shrink-0 items-center text-[13px] font-medium md:min-h-11 md:w-[84px] md:text-[14px]",
                    dayRows.length > 0 && dayRows.every((row) => row.is_closed)
                      ? "text-ink-subtle md:text-ink"
                      : "text-ink",
                  )}
                >
                  <span className="md:hidden" aria-hidden="true">
                    {WEEKDAYS_SHORT[weekday]}
                  </span>
                  <span className="max-md:sr-only">{label}</span>
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {dayRows.length === 0 && (
                    <div className="flex flex-wrap items-center gap-x-[14px] gap-y-1">
                      <span className="flex min-h-[46px] items-center text-[13px] text-ink-muted md:min-h-11">
                        No hours set
                      </span>
                      <button
                        type="button"
                        className={textLinkButtonClass}
                        disabled={adding}
                        onClick={() => addRowForWeekday(weekday)}
                      >
                        {adding ? "Adding…" : "Add hours"}
                      </button>
                    </div>
                  )}

                  {dayRows.map((row, index) => (
                    <div key={row.id} className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-x-[9px] gap-y-1 md:flex-nowrap md:gap-[14px]">
                        <div className="flex min-w-0 basis-full items-center gap-[9px] md:basis-auto md:gap-[14px]">
                          <Input
                            type="time"
                            defaultValue={row.opens_at ?? ""}
                            disabled={row.is_closed}
                            className={timeInputClass}
                            aria-label={`${label} opening time${index > 0 ? `, shift ${index + 1}` : ""}`}
                            onChange={(e) =>
                              onHoursTime(row, "opens_at", e.target.value, "schedule")
                            }
                            onBlur={(e) => onHoursTime(row, "opens_at", e.target.value, "flush")}
                          />
                          <span
                            aria-hidden="true"
                            className={cn(
                              "hidden text-[14px] md:inline",
                              row.is_closed ? "text-[#D3CBBD]" : "text-ink-subtle",
                            )}
                          >
                            to
                          </span>
                          <Input
                            type="time"
                            defaultValue={row.closes_at ?? ""}
                            disabled={row.is_closed}
                            className={timeInputClass}
                            aria-label={`${label} closing time${index > 0 ? `, shift ${index + 1}` : ""}`}
                            onChange={(e) =>
                              onHoursTime(row, "closes_at", e.target.value, "schedule")
                            }
                            onBlur={(e) => onHoursTime(row, "closes_at", e.target.value, "flush")}
                          />
                        </div>
                        <label
                          className={cn(
                            "flex min-h-11 cursor-pointer items-center gap-2 text-[13px]",
                            row.is_closed ? "font-medium text-ink" : "text-ink-muted",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={row.is_closed}
                            className={checkboxClass}
                            onChange={(e) =>
                              hoursAutosave.saveNow(
                                row.id,
                                "is_closed",
                                { is_closed: e.target.checked },
                                (patch) =>
                                  saveHoursField(
                                    row.id,
                                    "is_closed",
                                    patch.is_closed as HoursRow["is_closed"],
                                  ),
                              )
                            }
                          />
                          Closed
                          {index > 0 && (
                            <span className="sr-only">{`(${label}, shift ${index + 1})`}</span>
                          )}
                        </label>
                        <button
                          type="button"
                          className={cn(iconButtonClass, "max-md:ml-auto")}
                          aria-label={`Remove this ${label} row`}
                          title="Remove"
                          onClick={() => removeRow(row.id)}
                        >
                          <X aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </div>
                      <SaveIndicator state={hoursAutosave.statusFor(row.id, "opens_at")} />
                      <SaveIndicator state={hoursAutosave.statusFor(row.id, "closes_at")} />
                      <SaveIndicator state={hoursAutosave.statusFor(row.id, "is_closed")} />
                      <SaveIndicator state={hoursAutosave.statusFor(row.id, "_row")} />
                    </div>
                  ))}

                  {dayRows.length > 0 && (
                    <button
                      type="button"
                      className={cn(textLinkButtonClass, "-mt-1")}
                      disabled={adding}
                      onClick={() => addRowForWeekday(weekday)}
                    >
                      {adding ? "Adding…" : "Add another shift"}
                      <span className="sr-only">{` for ${label}`}</span>
                    </button>
                  )}
                  <SaveIndicator state={addRowStatus[weekday] ?? IDLE} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section
        className="flex flex-col gap-[10px] md:gap-3"
        aria-labelledby="special-hours-heading"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="special-hours-heading" className={cn(sectionLabelClass, "font-sans")}>
            Holidays &amp; one-off changes
          </h2>
          <p className="text-[12px] text-ink-subtle">Replaces your weekly hours for that date</p>
        </div>

        {specialAutosave.rows.length === 0 && (
          <p className="text-[13px] text-ink-muted">No holidays or one-off changes yet.</p>
        )}

        {specialAutosave.rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-col gap-3 rounded-[12px] border border-canvas-border bg-white px-[14px] py-[13px] md:px-[17px] md:py-[15px]"
          >
            <div className="flex flex-wrap items-end gap-x-[14px] gap-y-2">
              <div className="flex flex-col gap-[7px]">
                <label htmlFor={`date-${row.id}`} className={fieldLabelClass}>
                  Date
                </label>
                <Input
                  id={`date-${row.id}`}
                  type="date"
                  defaultValue={row.date}
                  className={cn(timeInputClass, "flex-none md:w-[164px]")}
                  onChange={(e) => onSpecialDate(row, e.target.value, "schedule")}
                  onBlur={(e) => onSpecialDate(row, e.target.value, "flush")}
                />
              </div>
              <label
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-2 text-[13px]",
                  row.is_closed ? "font-medium text-ink" : "text-ink-muted",
                )}
              >
                <input
                  type="checkbox"
                  checked={row.is_closed}
                  className={checkboxClass}
                  onChange={(e) =>
                    specialAutosave.saveNow(
                      row.id,
                      "is_closed",
                      { is_closed: e.target.checked },
                      (patch) =>
                        saveSpecialField(
                          row.id,
                          "is_closed",
                          patch.is_closed as SpecialHoursRow["is_closed"],
                        ),
                    )
                  }
                />
                Closed all day
              </label>
              <button
                type="button"
                className={cn(secondaryButtonClass, "ml-auto")}
                onClick={() => removeSpecial(row.id)}
              >
                Remove
              </button>
            </div>
            <SaveIndicator state={specialAutosave.statusFor(row.id, "date")} />
            <SaveIndicator state={specialAutosave.statusFor(row.id, "is_closed")} />
            <SaveIndicator state={specialAutosave.statusFor(row.id, "_row")} />

            {!row.is_closed && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-[9px] md:gap-[14px]">
                  <Input
                    type="time"
                    defaultValue={row.opens_at ?? ""}
                    className={timeInputClass}
                    aria-label="Opening time"
                    onChange={(e) => onSpecialTime(row, "opens_at", e.target.value, "schedule")}
                    onBlur={(e) => onSpecialTime(row, "opens_at", e.target.value, "flush")}
                  />
                  <span aria-hidden="true" className="text-[14px] text-ink-subtle">
                    to
                  </span>
                  <Input
                    type="time"
                    defaultValue={row.closes_at ?? ""}
                    className={timeInputClass}
                    aria-label="Closing time"
                    onChange={(e) => onSpecialTime(row, "closes_at", e.target.value, "schedule")}
                    onBlur={(e) => onSpecialTime(row, "closes_at", e.target.value, "flush")}
                  />
                </div>
              </div>
            )}
            <SaveIndicator state={specialAutosave.statusFor(row.id, "opens_at")} />
            <SaveIndicator state={specialAutosave.statusFor(row.id, "closes_at")} />

            <div className="flex flex-col gap-[7px]">
              <label htmlFor={`note-${row.id}`} className={fieldLabelClass}>
                Note (shown on the profile)
              </label>
              <Input
                id={`note-${row.id}`}
                defaultValue={row.note ?? ""}
                className={textInputClass}
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

        <button
          type="button"
          className={cn(secondaryButtonClass, "self-start")}
          disabled={addHolidayStatus.status === "saving"}
          onClick={addHoliday}
        >
          {addHolidayStatus.status === "saving" ? "Adding…" : "Add a holiday or one-off change"}
        </button>
        <SaveIndicator state={addHolidayStatus} />
      </section>
    </>
  );
}
