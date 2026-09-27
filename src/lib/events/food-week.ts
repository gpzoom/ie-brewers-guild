import {
  addDays,
  getZonedNow,
  weekdayOf,
  type SpecialHoursDay,
  type WeekdayHours,
} from "@/lib/hours/open-now";
import type { EventRow } from "@/lib/supabase/types";

/**
 * "Food this week" (docs/member-profiles.md, "Events" > "Food calendar"):
 * the next seven days at a producer's taproom, today first, in the
 * member's own time zone. A day lists the food vendors from their food
 * calendar; with none, it's "Closed" when their posted hours say so, and
 * "Bring your own food" otherwise. Pure -- the profile and the member's
 * own preview both draw from it.
 */

export const FOOD_WEEK_DAYS = 7;

export type FoodVendor = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  description: string | null;
  /** The vendor's picture from their calendar entry, when there is one. */
  imageUrl: string | null;
};

export type FoodDay = {
  /** YYYY-MM-DD, the member's local date. */
  date: string;
  vendors: FoodVendor[];
  /** vendors: someone's scheduled · closed: the posted hours say closed · byo: bring your own food. */
  status: "vendors" | "closed" | "byo";
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
}): FoodDay[] {
  const { slots, now, timezone, hours, specialHours } = params;
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
      imageUrl: slot.image_url ?? null,
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
        : "byo";
    return { date, vendors, status };
  });
}

/**
 * For the collapsed "Food this week" (only today shows): the next day after
 * today with a vendor, and its first vendor, so the toggle can say "Next
 * food truck: Fri, Tacos El Rey". Null when today has a vendor itself or
 * nothing is scheduled in the rest of the week.
 */
export function nextFoodVendor(week: FoodDay[]): { date: string; title: string } | null {
  if (week[0]?.status === "vendors") return null;
  const day = week.slice(1).find((candidate) => candidate.status === "vendors");
  return day ? { date: day.date, title: day.vendors[0].title } : null;
}
