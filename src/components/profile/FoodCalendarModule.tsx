import type { EventRow } from "@/lib/supabase/types";
import type { SpecialHoursDay, WeekdayHours } from "@/lib/hours/open-now";
import { buildFoodWeek, type FoodDay } from "@/lib/events/food-week";
import { SectionLabel } from "@/components/profile/SectionLabel";
import { EventDescription } from "@/components/profile/EventDescription";
import { formatTimeRange, GuildMemberPill } from "@/components/profile/EventsModule";
import { Link } from "@tanstack/react-router";
import type { ProfileEvent } from "@/lib/events/guest-display";
import { cn } from "@/lib/utils";

// A local YYYY-MM-DD, drawn as the date column (weekday / day / month) --
// read at noon UTC so no time zone can move it to another day.
function dayParts(date: string): { weekday: string; day: string; month: string } {
  const noon = new Date(`${date}T12:00:00Z`);
  return {
    weekday: noon.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    day: noon.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" }),
    month: noon.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
  };
}

function FoodDayRow({
  day,
  isToday,
  timezone,
}: {
  day: FoodDay;
  isToday: boolean;
  timezone: string;
}) {
  const { weekday, day: dayNumber, month } = dayParts(day.date);
  const quiet = day.status !== "vendors";
  return (
    <li
      className={cn(
        "flex min-h-14 gap-[13px] rounded-xl border px-[13px] py-[11px] lg:gap-4 lg:rounded-[13px] lg:px-4 lg:py-[13px]",
        quiet
          ? "items-center border-canvas-2 bg-[#F7F4EE]"
          : "items-start border-canvas-border bg-white",
      )}
    >
      <div className="flex w-10 shrink-0 flex-col items-center lg:w-[46px]">
        <span className="text-[9px] uppercase tracking-[0.1em] text-ink-muted lg:text-[10px]">
          {isToday ? "Today" : weekday}
        </span>
        <span className="font-display text-[19px] leading-[1.05] text-ink lg:text-[22px]">
          {dayNumber}
        </span>
        <span className="text-[9px] uppercase tracking-[0.1em] text-ink-muted lg:text-[10px]">
          {month}
        </span>
      </div>
      {day.status === "vendors" ? (
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          {day.vendors.map((vendor) => (
            <div key={vendor.id} className="flex min-w-0 items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-[3px] lg:gap-1">
                <span className="flex flex-wrap items-center gap-x-[7px] gap-y-1 text-[13px] font-semibold text-ink lg:text-[15px]">
                  {vendor.guest ? (
                    <>
                      <Link
                        to="/members/$slug"
                        params={{ slug: vendor.guest.slug }}
                        className="underline underline-offset-2 hover:text-brand"
                      >
                        {vendor.title}
                      </Link>
                      <GuildMemberPill />
                    </>
                  ) : (
                    vendor.title
                  )}
                </span>
                <span className="text-xs text-ink-muted lg:text-[13px]">
                  {vendor.allDay
                    ? "All day"
                    : formatTimeRange(vendor.startsAt, vendor.endsAt, timezone)}
                </span>
                {vendor.description && <EventDescription text={vendor.description} muted={false} />}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <span className="text-[13px] text-ink-muted lg:text-sm">
          {day.status === "closed"
            ? "Closed"
            : day.status === "kitchen"
              ? "Kitchen open"
              : "Bring your own food"}
        </span>
      )}
    </li>
  );
}

/**
 * "Food for the next week" (docs/member-profiles.md, "Events" > "Food
 * calendar"; artboard D): the next seven days at a producer's taproom,
 * today first, from their food calendar, all shown at once like "Upcoming
 * events" (owner, 2026-09-30; it used to open collapsed). Each day lists its
 * food vendors (name, time, description with links); a day with none says
 * "Bring your own food" ("Kitchen open" with the kitchen switch on), or
 * "Closed" when the posted hours say so
 * (buildFoodWeek). Shown only for a producer with a food calendar connected
 * -- the template decides, and on desktop puts it under the photo carousel.
 */
export function FoodCalendarModule({
  slots,
  now,
  timezone,
  hours,
  specialHours,
  hasKitchen = false,
  guestSlots = [],
  label = "Food for the next week",
}: {
  slots: EventRow[];
  /** Guild food vendors' stops at this taproom (Guild Mobile members at taprooms). */
  guestSlots?: ProfileEvent[];
  now: Date;
  timezone: string;
  hours: WeekdayHours[];
  specialHours: SpecialHoursDay[];
  /** The member's "We have our own kitchen" switch: empty open days say "Kitchen open". */
  hasKitchen?: boolean;
  label?: string;
}) {
  const week = buildFoodWeek({ slots, now, timezone, hours, specialHours, hasKitchen, guestSlots });
  return (
    <section className="flex flex-col gap-[9px] lg:gap-[11px]">
      <SectionLabel>{label}</SectionLabel>
      <ul className="flex flex-col gap-[9px] lg:gap-[11px]">
        {week.map((day, i) => (
          <FoodDayRow key={day.date} day={day} isToday={i === 0} timezone={timezone} />
        ))}
      </ul>
    </section>
  );
}
