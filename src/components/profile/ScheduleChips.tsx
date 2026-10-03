import { getZonedNow, type WeekdayHours } from "@/lib/hours/open-now";
import type { MemberType } from "@/lib/supabase/types";
import { SectionLabel } from "@/components/profile/SectionLabel";
import { cn } from "@/lib/utils";

type ScheduleChipsProps = {
  hours: WeekdayHours[];
  memberType: MemberType;
  hoursConfirmedAt: string | null;
  timezone: string;
  // Server-computed instant (MemberProfileData.now) -- see StatusBlock's
  // `now` prop for why it's never read fresh here.
  now: Date;
};

// Monday first, as the artboards draw the week. Values are JS weekdays
// (0 = Sunday), matching the hours rows.
const WEEK: { weekday: number; label: string }[] = [
  { weekday: 1, label: "Mon" },
  { weekday: 2, label: "Tue" },
  { weekday: 3, label: "Wed" },
  { weekday: 4, label: "Thu" },
  { weekday: 5, label: "Fri" },
  { weekday: 6, label: "Sat" },
  { weekday: 0, label: "Sun" },
];

// "3–9", "12–11", "3:30–9" -- the chips drop am/pm to fit seven across a
// phone (artboards D/V).
function formatChipTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour24 = Number(hourStr);
  const minute = Number(minuteStr);
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0 ? `${hour12}` : `${hour12}:${String(minute).padStart(2, "0")}`;
}

// Spec, "Hours and the publish gate": once hours_confirmed_at is more
// than 90 days old, a quiet "Hours confirmed [Month Year]" line sits
// beside the schedule heading. Fresh hours show nothing.
function formatHoursConfirmedLabel(hoursConfirmedAt: string | null, now: Date, timezone: string): string | null {
  if (!hoursConfirmedAt) return null;
  const confirmedDate = new Date(hoursConfirmedAt);
  const ninetyDaysAgo = now.getTime() - 90 * 24 * 60 * 60 * 1000;
  if (confirmedDate.getTime() > ninetyDaysAgo) return null;
  return `Hours confirmed ${confirmedDate.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: timezone })}`;
}

/**
 * Seven-day hour chips (spec, "Member types": producer and Allied Member
 * both get this module, mobile members get EventsModule instead). Today's
 * chip -- in the member's own timezone -- is the dark one (artboards D/V/L).
 * The "five-day business hour chips" in the spec's comparison table is a
 * typical Allied Member's actual schedule, not a different component: the
 * same seven chips just show closed days as a dash.
 */
export function ScheduleChips({ hours, memberType, hoursConfirmedAt, timezone, now }: ScheduleChipsProps) {
  if (memberType === "mobile" || hours.length === 0) return null;

  const today = getZonedNow(now, timezone).weekday;
  const staleLabel = formatHoursConfirmedLabel(hoursConfirmedAt, now, timezone);

  return (
    <section className="flex flex-col gap-[9px] lg:gap-[11px]">
      <SectionLabel aside={staleLabel}>{memberType === "allied" ? "Business hours" : "This week"}</SectionLabel>
      <ul className="flex gap-1.5 lg:gap-2" aria-label="Weekly hours">
        {WEEK.map(({ weekday, label }) => {
          const rowsForDay = hours.filter((row) => row.weekday === weekday && !row.isClosed && row.opensAt && row.closesAt);
          const isClosed = rowsForDay.length === 0;
          const isToday = weekday === today;
          return (
            <li
              key={weekday}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "flex min-h-[68px] min-w-0 flex-1 flex-col items-center justify-center gap-[5px] rounded-[11px] px-0.5 py-2 text-center lg:min-h-20 lg:gap-1.5 lg:rounded-xl",
                isToday ? "bg-ink" : isClosed ? "bg-[#F2EEE7]" : "bg-canvas-2",
              )}
            >
              <span
                className={cn(
                  "text-[9px] uppercase tracking-[0.1em] lg:text-[10px]",
                  isToday ? "text-[#CFC6B6]" : isClosed ? "text-ink-subtle" : "text-ink-muted",
                )}
              >
                {label}
              </span>
              {isClosed ? (
                <span className={cn("text-[11px] lg:text-[13px]", isToday ? "text-canvas" : "text-[#A89D8E]")}>
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">Closed</span>
                </span>
              ) : (
                rowsForDay.map((row, i) => (
                  <span
                    key={i}
                    className={cn(
                      "text-[11px] leading-tight lg:text-[13px]",
                      isToday ? "font-semibold text-canvas" : "text-[#3A332C]",
                    )}
                  >
                    {formatChipTime(row.opensAt as string)}&ndash;{formatChipTime(row.closesAt as string)}
                  </span>
                ))
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
