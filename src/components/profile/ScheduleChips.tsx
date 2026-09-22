import type { WeekdayHours } from "@/lib/hours/open-now";
import type { MemberType } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type ScheduleChipsProps = {
  hours: WeekdayHours[];
  memberType: MemberType;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Producer and Allied Member both get seven-day chips; the "five-day
// business hour chips" line in the spec's comparison table describes a
// typical Allied Member's actual schedule (closed weekends), not a
// different component -- the same seven-slot chip row just renders
// "Closed" for the days the member has none.
function formatChipTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour24 = Number(hourStr);
  const minute = Number(minuteStr);
  const period = hour24 >= 12 ? "p" : "a";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0 ? `${hour12}${period}` : `${hour12}:${String(minute).padStart(2, "0")}${period}`;
}

/** Seven-day hour chips (spec, "Member types": producer and Allied Member both get this module, mobile members get EventsModule instead). */
export function ScheduleChips({ hours, memberType }: ScheduleChipsProps) {
  if (memberType === "mobile" || hours.length === 0) return null;

  return (
    <div className="grid grid-cols-7 gap-1.5" role="list" aria-label="Weekly hours">
      {WEEKDAY_LABELS.map((label, weekday) => {
        const rowsForDay = hours.filter((row) => row.weekday === weekday);
        const isClosed = rowsForDay.length === 0 || rowsForDay.every((row) => row.isClosed);
        return (
          <div
            key={weekday}
            role="listitem"
            className="flex min-h-11 flex-col items-center justify-center rounded-md border border-canvas-border bg-canvas px-1 py-2 text-center"
          >
            <span className="text-[11px] font-semibold uppercase text-ink-muted">{label}</span>
            {isClosed ? (
              <span className="text-xs text-ink-muted">Closed</span>
            ) : (
              rowsForDay.map((row, i) => (
                <span key={i} className="text-xs text-ink">
                  {row.opensAt && formatChipTime(row.opensAt)}&ndash;{row.closesAt && formatChipTime(row.closesAt)}
                </span>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
