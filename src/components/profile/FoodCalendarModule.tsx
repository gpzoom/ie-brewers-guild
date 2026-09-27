import type { EventRow } from "@/lib/supabase/types";
import type { SpecialHoursDay, WeekdayHours } from "@/lib/hours/open-now";
import { buildFoodWeek } from "@/lib/events/food-week";
import { SectionLabel } from "@/components/profile/SectionLabel";
import { EventDescription } from "@/components/profile/EventDescription";
import { formatTimeRange } from "@/components/profile/EventsModule";
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

/**
 * "Food this week" (docs/member-profiles.md, "Events" > "Food calendar";
 * artboard D): the next seven days at a producer's taproom, today first,
 * from their food calendar. Each day lists its food vendors (name, time,
 * description with links); a day with none says "Bring your own food", or
 * "Closed" when the posted hours say so (buildFoodWeek). Shown only for a
 * producer with a food calendar connected -- the template decides.
 */
export function FoodCalendarModule({
  slots,
  now,
  timezone,
  hours,
  specialHours,
  label = "Food this week",
}: {
  slots: EventRow[];
  now: Date;
  timezone: string;
  hours: WeekdayHours[];
  specialHours: SpecialHoursDay[];
  label?: string;
}) {
  const week = buildFoodWeek({ slots, now, timezone, hours, specialHours });

  return (
    <section className="flex flex-col gap-[9px] lg:gap-[11px]">
      <SectionLabel>{label}</SectionLabel>
      <ul className="flex flex-col gap-[9px] lg:gap-[11px]">
        {week.map((day, index) => {
          const { weekday, day: dayNumber, month } = dayParts(day.date);
          const quiet = day.status !== "vendors";
          return (
            <li
              key={day.date}
              className={cn(
                "flex min-h-14 gap-[13px] rounded-xl border px-[13px] py-[11px] lg:gap-4 lg:rounded-[13px] lg:px-4 lg:py-[13px]",
                quiet
                  ? "items-center border-canvas-2 bg-[#F7F4EE]"
                  : "items-start border-canvas-border bg-white",
              )}
            >
              <div className="flex w-10 shrink-0 flex-col items-center lg:w-[46px]">
                <span className="text-[9px] uppercase tracking-[0.1em] text-ink-muted lg:text-[10px]">
                  {index === 0 ? "Today" : weekday}
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
                    <div key={vendor.id} className="flex min-w-0 flex-col gap-[3px] lg:gap-1">
                      <span className="text-[13px] font-semibold text-ink lg:text-[15px]">
                        {vendor.title}
                      </span>
                      <span className="text-xs text-ink-muted lg:text-[13px]">
                        {formatTimeRange(vendor.startsAt, vendor.endsAt, timezone)}
                      </span>
                      {vendor.description && (
                        <EventDescription text={vendor.description} muted={false} />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-[13px] text-ink-muted lg:text-sm">
                  {day.status === "closed" ? "Closed" : "Bring your own food"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
