import type { SpecialHoursDay, WeekdayHours } from "@/lib/hours/open-now";
import type { HoursRow, SpecialHoursRow } from "@/lib/supabase/types";

/** hours rows as open-now.ts reads them (the profile template, "Food this week"). */
export function toWeekdayHours(rows: HoursRow[]): WeekdayHours[] {
  return rows.map((row) => ({
    weekday: row.weekday,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    closesNextDay: row.closes_next_day,
    isClosed: row.is_closed,
  }));
}

/** special_hours rows as open-now.ts reads them. */
export function toSpecialHoursDay(rows: SpecialHoursRow[]): SpecialHoursDay[] {
  return rows.map((row) => ({
    date: row.date,
    isClosed: row.is_closed,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    closesNextDay: row.closes_next_day,
    note: row.note,
  }));
}
