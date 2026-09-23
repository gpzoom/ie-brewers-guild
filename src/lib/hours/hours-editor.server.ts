import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { recordAuditLogIfImpersonating } from "@/lib/guild/audit-log.server";
import type { HoursRow, SpecialHoursRow } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The two `hours`/`special_hours` queries `listHours` needs, extracted into
 * a plain helper so `publish-gate.server.ts`'s getPublishGateData can reuse
 * them without calling `listHours` itself as a createServerFn from inside
 * another handler's body (not the right pattern in this framework -- see
 * that file's own doc comment). Takes an already-created Supabase client so
 * it's reusable regardless of caller.
 */
export async function fetchMemberHoursAndSpecialHours(
  supabase: SupabaseClient,
  memberId: string,
): Promise<{ hours: HoursRow[]; specialHours: SpecialHoursRow[] }> {
  const [{ data: hours, error: hoursError }, { data: specialHours, error: specialHoursError }] =
    await Promise.all([
      supabase
        .from("hours")
        .select("id, member_id, weekday, opens_at, closes_at, closes_next_day, is_closed")
        .eq("member_id", memberId)
        .order("weekday"),
      supabase
        .from("special_hours")
        .select("id, member_id, date, is_closed, opens_at, closes_at, closes_next_day, note")
        .eq("member_id", memberId)
        .order("date"),
    ]);
  if (hoursError) throw new Error(hoursError.message);
  if (specialHoursError) throw new Error(specialHoursError.message);
  return {
    hours: (hours ?? []) as HoursRow[],
    specialHours: (specialHours ?? []) as SpecialHoursRow[],
  };
}

export const listHours = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    return fetchMemberHoursAndSpecialHours(supabase, data.memberId);
  });

// --- validation helpers -----------------------------------------------
//
// `hours.weekday` has a DB check constraint (`between 0 and 6`) and
// `opens_at`/`closes_at` are Postgres `time` columns -- a malformed value
// sent to either wouldn't silently succeed, but it also wouldn't fail
// cleanly: the check-constraint violation and the time-parse error both
// surface as raw Postgres error text with no useful message for the
// person editing the form. Validating here means a bad value gets a
// message that says what's actually wrong, before it ever reaches
// Postgres.
const WEEKDAY_MIN = 0;
const WEEKDAY_MAX = 6;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidWeekday(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= WEEKDAY_MIN &&
    value <= WEEKDAY_MAX
  );
}

function isValidTimeString(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

/** Rejects both malformed strings and calendar-invalid ones (e.g. 2026-02-30). */
function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// --- hours (weekly grid) -------------------------------------------------

/**
 * The exact set of `hours` columns this editor is allowed to touch -- the
 * source of truth, per member-basics.server.ts's BASICS_KEYS precedent.
 * HoursPatch is DERIVED from this array (Pick<HoursRow, ...>), not defined
 * independently, so a new column can't be added to the patch type without
 * first being added here.
 */
const HOURS_KEYS = [
  "weekday",
  "opens_at",
  "closes_at",
  "closes_next_day",
  "is_closed",
] as const satisfies readonly (keyof HoursRow)[];

export type HoursPatch = Partial<Pick<HoursRow, (typeof HOURS_KEYS)[number]>>;

function filterHoursPatch(patch: unknown): HoursPatch {
  if (typeof patch !== "object" || patch === null) {
    throw new Error("Invalid update.");
  }
  return Object.fromEntries(
    Object.entries(patch).filter(([key]) => (HOURS_KEYS as readonly string[]).includes(key)),
  );
}

function validateHoursPatch(patch: HoursPatch) {
  if (patch.weekday !== undefined && !isValidWeekday(patch.weekday)) {
    throw new Error("Weekday must be an integer between 0 and 6.");
  }
  if (
    patch.opens_at !== undefined &&
    patch.opens_at !== null &&
    !isValidTimeString(patch.opens_at)
  ) {
    throw new Error("Opening time must be a valid time.");
  }
  if (
    patch.closes_at !== undefined &&
    patch.closes_at !== null &&
    !isValidTimeString(patch.closes_at)
  ) {
    throw new Error("Closing time must be a valid time.");
  }
  if (patch.closes_next_day !== undefined && typeof patch.closes_next_day !== "boolean") {
    throw new Error("Invalid value for closes_next_day.");
  }
  if (patch.is_closed !== undefined && typeof patch.is_closed !== "boolean") {
    throw new Error("Invalid value for is_closed.");
  }
}

/**
 * Multiple rows per weekday are allowed (split hours) -- id is present for
 * an update, absent for a new row. Same allowlist-then-validate-then-write
 * shape as updateMemberBasics, and the same `.select()` + row-count check
 * on the update path: PostgREST reports an RLS-denied update as success
 * with zero rows affected, not as an `error`, so without the check this
 * would silently report { ok: true } for a write that never happened.
 */
export const upsertHoursRow = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; id?: string; patch: HoursPatch }) => data)
  .handler(async ({ data }) => {
    const patch = filterHoursPatch(data.patch);
    if (Object.keys(patch).length === 0) {
      throw new Error("No hours fields to update.");
    }
    validateHoursPatch(patch);

    const supabase = await getSupabaseServerClientForRequest();

    if (data.id) {
      const { data: updated, error } = await supabase
        .from("hours")
        .update(patch)
        .eq("id", data.id)
        .select("id");
      if (error) throw new Error(error.message);
      if (!updated || updated.length === 0) {
        throw new Error("Save failed -- you may not have permission to edit this row.");
      }

      await recordAuditLogIfImpersonating({
        memberId: data.memberId,
        tableName: "hours",
        rowId: data.id,
        action: "update",
      });

      return { id: data.id };
    }

    if (!isValidWeekday(patch.weekday)) {
      throw new Error("Weekday is required for a new hours row.");
    }
    const { data: created, error } = await supabase
      .from("hours")
      .insert({ member_id: data.memberId, ...patch })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await recordAuditLogIfImpersonating({
      memberId: data.memberId,
      tableName: "hours",
      rowId: created.id as string,
      action: "insert",
    });

    return { id: created.id as string };
  });

export const deleteHoursRow = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: deleted, error } = await supabase
      .from("hours")
      .delete()
      .eq("id", data.id)
      .select("id, member_id");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) {
      throw new Error("Delete failed -- you may not have permission to remove this row.");
    }

    await recordAuditLogIfImpersonating({
      memberId: deleted[0].member_id as string,
      tableName: "hours",
      rowId: data.id,
      action: "delete",
    });

    return { ok: true as const };
  });

// --- special hours (holidays / one-off changes) ---------------------------

/** Same derivation pattern as HOURS_KEYS above. */
const SPECIAL_HOURS_KEYS = [
  "date",
  "is_closed",
  "opens_at",
  "closes_at",
  "closes_next_day",
  "note",
] as const satisfies readonly (keyof SpecialHoursRow)[];

export type SpecialHoursPatch = Partial<Pick<SpecialHoursRow, (typeof SPECIAL_HOURS_KEYS)[number]>>;

function filterSpecialHoursPatch(patch: unknown): SpecialHoursPatch {
  if (typeof patch !== "object" || patch === null) {
    throw new Error("Invalid update.");
  }
  return Object.fromEntries(
    Object.entries(patch).filter(([key]) =>
      (SPECIAL_HOURS_KEYS as readonly string[]).includes(key),
    ),
  );
}

function validateSpecialHoursPatch(patch: SpecialHoursPatch) {
  if (patch.date !== undefined && !isValidDateString(patch.date)) {
    throw new Error("Date must be a valid calendar date.");
  }
  if (
    patch.opens_at !== undefined &&
    patch.opens_at !== null &&
    !isValidTimeString(patch.opens_at)
  ) {
    throw new Error("Opening time must be a valid time.");
  }
  if (
    patch.closes_at !== undefined &&
    patch.closes_at !== null &&
    !isValidTimeString(patch.closes_at)
  ) {
    throw new Error("Closing time must be a valid time.");
  }
  if (patch.closes_next_day !== undefined && typeof patch.closes_next_day !== "boolean") {
    throw new Error("Invalid value for closes_next_day.");
  }
  if (patch.is_closed !== undefined && typeof patch.is_closed !== "boolean") {
    throw new Error("Invalid value for is_closed.");
  }
  if (patch.note !== undefined && patch.note !== null && typeof patch.note !== "string") {
    throw new Error("Invalid note.");
  }
}

/**
 * `special_hours` has a `unique (member_id, date)` constraint
 * (supabase/migrations/20260922153458_final_review_fixes.sql, "10." --
 * named `special_hours_member_id_date_key`), added specifically to make a
 * duplicate-date row impossible at the DB level rather than merely
 * discouraged in the UI. A violation surfaces via PostgREST as Postgres
 * error code 23505 with the raw constraint name in the message -- fine
 * for a log, not for the "Couldn't save" banner a member actually reads.
 */
function specialHoursErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === "23505" && error.message.includes("special_hours_member_id_date_key")) {
    return "You already have hours set for this date -- edit the existing entry instead.";
  }
  return error.message;
}

export const upsertSpecialHoursRow = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; id?: string; patch: SpecialHoursPatch }) => data)
  .handler(async ({ data }) => {
    const patch = filterSpecialHoursPatch(data.patch);
    if (Object.keys(patch).length === 0) {
      throw new Error("No special-hours fields to update.");
    }
    validateSpecialHoursPatch(patch);

    const supabase = await getSupabaseServerClientForRequest();

    if (data.id) {
      const { data: updated, error } = await supabase
        .from("special_hours")
        .update(patch)
        .eq("id", data.id)
        .select("id");
      if (error) throw new Error(specialHoursErrorMessage(error));
      if (!updated || updated.length === 0) {
        throw new Error("Save failed -- you may not have permission to edit this row.");
      }

      await recordAuditLogIfImpersonating({
        memberId: data.memberId,
        tableName: "special_hours",
        rowId: data.id,
        action: "update",
      });

      return { id: data.id };
    }

    if (!isValidDateString(patch.date)) {
      throw new Error("Date is required for a new special-hours row.");
    }
    const { data: created, error } = await supabase
      .from("special_hours")
      .insert({ member_id: data.memberId, ...patch })
      .select("id")
      .single();
    if (error) throw new Error(specialHoursErrorMessage(error));

    await recordAuditLogIfImpersonating({
      memberId: data.memberId,
      tableName: "special_hours",
      rowId: created.id as string,
      action: "insert",
    });

    return { id: created.id as string };
  });

export const deleteSpecialHoursRow = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: deleted, error } = await supabase
      .from("special_hours")
      .delete()
      .eq("id", data.id)
      .select("id, member_id");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) {
      throw new Error("Delete failed -- you may not have permission to remove this row.");
    }

    await recordAuditLogIfImpersonating({
      memberId: deleted[0].member_id as string,
      tableName: "special_hours",
      rowId: data.id,
      action: "delete",
    });

    return { ok: true as const };
  });
