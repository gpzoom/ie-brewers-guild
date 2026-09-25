/**
 * Computes "open now" per the spec's exact algorithm ("Computing 'open
 * now'"). All arithmetic happens on a unified "minutes relative to the
 * member's local midnight today" timeline, built from Intl.DateTimeFormat
 * parts for the member's own IANA timezone -- never the server's or the
 * visitor's (spec, rule 1). This avoids needing a timezone-database
 * dependency: Intl already has one.
 */

export type WeekdayHours = {
  weekday: number; // 0 = Sunday .. 6 = Saturday
  opensAt: string | null; // "HH:MM" or "HH:MM:SS", local wall-clock
  closesAt: string | null;
  closesNextDay: boolean;
  isClosed: boolean;
};

export type SpecialHoursDay = {
  date: string; // "YYYY-MM-DD"
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
  closesNextDay: boolean;
  note: string | null;
};

export type OpenNowResult =
  | {
      status: "open";
      closesInLabel: string;
      // The profile's status block reads "Closes 9:00 pm · 2 hr 40 min left"
      // (artboards D/L): the local closing clock and the bare duration.
      closesAtLabel: string;
      remainingLabel: string;
      note: string | null;
    }
  | { status: "closed"; nextOpenLabel: string | null; note: string | null }
  | { status: "unknown" };

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MINUTES_PER_DAY = 1440;

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatClockLabel(minutesSinceMidnight: number): string {
  const wrapped = ((minutesSinceMidnight % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour24 = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const period = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0 ? `${hour12}${period}` : `${hour12}:${String(minute).padStart(2, "0")}${period}`;
}

/** "9:00 pm" / "12:30 am" -- the status block's closing-time style. */
function formatClockWithMinutes(minutesSinceMidnight: number): string {
  const wrapped = ((minutesSinceMidnight % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour24 = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const period = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

export function formatDurationLabel(totalMinutes: number): string {
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hrs} hr ${mins} min`;
}

function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayOf(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * The member's local wall-clock date (YYYY-MM-DD), weekday (0-6), and
 * minutes-since-local-midnight for a given instant and IANA timezone.
 */
export function getZonedNow(instant: Date, timeZone: string): { date: string; weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  // Some Intl implementations render local midnight as hour "24" rather
  // than "00" under hour12: false -- normalize defensively.
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));

  return { date, weekday: weekdayOf(date), minutes: hour * 60 + minute };
}

// relative to today's local midnight = 0. `note` travels with the interval
// itself (null for a plain weekly row, the special_hours row's own note when
// the interval came from one) so that whichever interval actually contains
// "now" is what supplies the note shown to the visitor -- not necessarily
// today's special_hours row, since the containing interval can belong to
// yesterday's data (see rule 4/5 bleed-over below).
type Interval = { startMinutes: number; endMinutes: number; note: string | null };

function intervalsForDate(params: {
  weekday: number;
  hours: WeekdayHours[];
  special: SpecialHoursDay | undefined;
  dayOffsetMinutes: number;
}): Interval[] {
  const { weekday, hours, special, dayOffsetMinutes } = params;

  if (special) {
    if (special.isClosed || !special.opensAt || !special.closesAt) return [];
    const start = toMinutes(special.opensAt) + dayOffsetMinutes;
    const end = toMinutes(special.closesAt) + dayOffsetMinutes + (special.closesNextDay ? MINUTES_PER_DAY : 0);
    return [{ startMinutes: start, endMinutes: end, note: special.note }];
  }

  return hours
    .filter((row) => row.weekday === weekday && !row.isClosed && row.opensAt && row.closesAt)
    .map((row) => ({
      startMinutes: toMinutes(row.opensAt as string) + dayOffsetMinutes,
      endMinutes:
        toMinutes(row.closesAt as string) + dayOffsetMinutes + (row.closesNextDay ? MINUTES_PER_DAY : 0),
      note: null,
    }));
}

export function computeOpenNow(params: {
  now: Date;
  timezone: string;
  hours: WeekdayHours[];
  specialHours: SpecialHoursDay[];
}): OpenNowResult {
  const { now, timezone, hours, specialHours } = params;

  if (hours.length === 0 && specialHours.length === 0) {
    return { status: "unknown" };
  }

  const zoned = getZonedNow(now, timezone);
  const specialByDate = new Map(specialHours.map((row) => [row.date, row]));
  const todaySpecial = specialByDate.get(zoned.date);

  const todayIntervals = intervalsForDate({
    weekday: zoned.weekday,
    hours,
    special: todaySpecial,
    dayOffsetMinutes: 0,
  });

  // Yesterday's bleed-over (spec rule 4/5) is a structural property of
  // YESTERDAY's own row -- rule 4's own example is "a taproom open until
  // 1am on Saturday is a Friday row... not a Saturday row." Today's
  // special_hours row (rule 2) only ever overrides TODAY's own hours; it
  // must never suppress an interval that structurally belongs to
  // yesterday. So this is always computed, never gated on whether today
  // has a special row of its own.
  const yesterdayIntervals = intervalsForDate({
    weekday: (zoned.weekday + 6) % 7,
    hours,
    special: specialByDate.get(addDays(zoned.date, -1)),
    dayOffsetMinutes: -MINUTES_PER_DAY,
  });

  const openInterval = [...todayIntervals, ...yesterdayIntervals].find(
    (interval) => zoned.minutes >= interval.startMinutes && zoned.minutes < interval.endMinutes,
  );

  if (openInterval) {
    // The note beside an "open" status belongs to whichever interval is
    // actually keeping the member open right now -- today's own hours (or
    // special override), or yesterday's bleed-over (and *that* row's own
    // special note, if it has one) -- never blindly "today's special,"
    // which may be an unrelated override that doesn't even apply yet.
    const remainingLabel = formatDurationLabel(openInterval.endMinutes - zoned.minutes);
    return {
      status: "open",
      closesInLabel: `Closes in ${remainingLabel}`,
      closesAtLabel: formatClockWithMinutes(openInterval.endMinutes),
      remainingLabel,
      note: openInterval.note,
    };
  }

  // Closed. The note shown beside a closed status is about TODAY's own
  // special_hours row, if any (e.g. "Thanksgiving") -- there is no
  // containing interval to attribute it to instead.
  const closedNote = todaySpecial?.note ?? null;

  // Find the earliest future interval across the next 7 days,
  // special_hours applied per date (spec, rule 7).
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const candidateDate = addDays(zoned.date, dayOffset);
    const candidateWeekday = weekdayOf(candidateDate);
    const dayOffsetMinutes = dayOffset * MINUTES_PER_DAY;

    const intervals = intervalsForDate({
      weekday: candidateWeekday,
      hours,
      special: specialByDate.get(candidateDate),
      dayOffsetMinutes,
    })
      .filter((interval) => interval.startMinutes >= zoned.minutes)
      .sort((a, b) => a.startMinutes - b.startMinutes);

    if (intervals.length > 0) {
      const clock = formatClockLabel(intervals[0].startMinutes - dayOffsetMinutes);
      return {
        status: "closed",
        nextOpenLabel: `Opens ${WEEKDAY_NAMES[candidateWeekday]} ${clock}`,
        note: closedNote,
      };
    }
  }

  return { status: "closed", nextOpenLabel: null, note: closedNote };
}
