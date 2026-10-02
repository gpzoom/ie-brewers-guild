import {
  addDays,
  getZonedNow,
  weekdayOf,
  type SpecialHoursDay,
  type WeekdayHours,
} from "@/lib/hours/open-now";
import type { EventRow } from "@/lib/supabase/types";

/**
 * "Food for the next week" (docs/member-profiles.md, "Events" > "Food calendar"):
 * the next seven days at a producer's taproom, today first, in the
 * member's own time zone. A day lists the food vendors from their food
 * calendar; with none, it's "Closed" when their posted hours say so, and
 * otherwise "Bring your own food" -- or "Kitchen open" for a taproom with
 * its own kitchen (the "We have our own kitchen" switch, owner 2026-10-02).
 * Pure -- the profile and the member's own preview both draw from it.
 */

export const FOOD_WEEK_DAYS = 7;

export type FoodVendor = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  description: string | null;
};

export type FoodDay = {
  /** YYYY-MM-DD, the member's local date. */
  date: string;
  vendors: FoodVendor[];
  /**
   * vendors: someone's scheduled · closed: the posted hours say closed ·
   * kitchen: open, nothing listed, and the taproom has its own kitchen ·
   * byo: open, nothing listed, bring your own food.
   */
  status: "vendors" | "closed" | "kitchen" | "byo";
};

function localDate(iso: string, timezone: string): string {
  return getZonedNow(new Date(iso), timezone).date;
}

/**
 * Closed on this local date by the posted hours, the way "open now" reads
 * them: a special-hours row for the date wins; otherwise a weekday with no
 * open row is closed. With no hours posted at all, nothing is known to be
 * closed.
 */
export function isClosedOnDate(
  date: string,
  hours: WeekdayHours[],
  specialHours: SpecialHoursDay[],
): boolean {
  if (hours.length === 0 && specialHours.length === 0) return false;
  const special = specialHours.find((row) => row.date === date);
  if (special) return special.isClosed || !special.opensAt || !special.closesAt;
  const weekday = weekdayOf(date);
  return !hours.some(
    (row) => row.weekday === weekday && !row.isClosed && row.opensAt && row.closesAt,
  );
}

export function buildFoodWeek(params: {
  slots: EventRow[];
  now: Date;
  timezone: string;
  hours: WeekdayHours[];
  specialHours: SpecialHoursDay[];
  /** The member's "We have our own kitchen" switch. */
  hasKitchen?: boolean;
}): FoodDay[] {
  const { slots, now, timezone, hours, specialHours, hasKitchen = false } = params;
  const today = getZonedNow(now, timezone).date;

  const byDate = new Map<string, FoodVendor[]>();
  for (const slot of [...slots].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    if (slot.kind !== "food" || slot.is_hidden || slot.overlay_status === "canceled") continue;
    const date = localDate(slot.starts_at, timezone);
    const list = byDate.get(date) ?? [];
    list.push({
      id: slot.id,
      title: slot.title?.trim() || slot.venue_name?.trim() || "Food vendor",
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
      allDay: slot.all_day === true,
      description: slot.description?.trim() || null,
    });
    byDate.set(date, list);
  }

  return Array.from({ length: FOOD_WEEK_DAYS }, (_, offset) => {
    const date = addDays(today, offset);
    const vendors = byDate.get(date) ?? [];
    const status: FoodDay["status"] = vendors.length
      ? "vendors"
      : isClosedOnDate(date, hours, specialHours)
        ? "closed"
        : hasKitchen
          ? "kitchen"
          : "byo";
    return { date, vendors, status };
  });
}
