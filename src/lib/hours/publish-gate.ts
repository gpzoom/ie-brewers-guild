const STALE_THRESHOLD_DAYS = 90;

export type HoursConfirmationBadge =
  | { kind: "never_confirmed" }
  | { kind: "recently_confirmed"; confirmedAt: string }
  | { kind: "stale"; confirmedAt: string; daysAgo: number };

/**
 * The three-way distinction the spec calls out explicitly (spec, "Hours
 * and the publish gate" + "Migrating the existing members"): null means
 * "never asked," never "stale" -- imported members must never see the
 * stale-hours warning for something they were never asked to do.
 */
export function computeHoursConfirmationBadge(
  hoursConfirmedAt: string | null,
  now: Date = new Date(),
): HoursConfirmationBadge {
  if (!hoursConfirmedAt) {
    return { kind: "never_confirmed" };
  }

  const confirmedAtMs = new Date(hoursConfirmedAt).getTime();
  const daysAgo = Math.floor((now.getTime() - confirmedAtMs) / (24 * 60 * 60 * 1000));

  if (daysAgo > STALE_THRESHOLD_DAYS) {
    return { kind: "stale", confirmedAt: hoursConfirmedAt, daysAgo };
  }
  return { kind: "recently_confirmed", confirmedAt: hoursConfirmedAt };
}

/** Mobile members have no weekly hours -- their publish gate warns if every listed appearance is already past. */
export function isEveryAppearanceInThePast(
  appearanceStartTimes: string[],
  now: Date = new Date(),
): boolean {
  if (appearanceStartTimes.length === 0) return true;
  return appearanceStartTimes.every((start) => new Date(start).getTime() < now.getTime());
}

/**
 * One weekday's line in the publish dialog's read-only hours summary --
 * "Not set" when the member has no row for that day, otherwise each row as
 * "Closed" or "opens–closes", comma-joined (a split shift is two rows).
 */
export function formatWeekdayHours(
  hours: ReadonlyArray<{
    weekday: number;
    is_closed: boolean;
    opens_at: string | null;
    closes_at: string | null;
  }>,
  weekday: number,
): string {
  const rows = hours.filter((row) => row.weekday === weekday);
  if (rows.length === 0) return "Not set";
  return rows
    .map((row) => (row.is_closed ? "Closed" : `${row.opens_at}–${row.closes_at}`))
    .join(", ");
}

/**
 * Whether the publish dialog's final Publish button may be pressed. The
 * dialog re-reads hours from the server every time it opens, and the
 * "These hours are correct as of today" confirmation only counts once that
 * fresh read has landed -- confirming against a stale or still-loading
 * view would defeat the point of the gate. Mobile members have no weekly
 * hours to confirm, but still wait for the fresh appearance list.
 */
export function canSubmitPublish({
  freshDataLoaded,
  isMobile,
  confirmed,
}: {
  freshDataLoaded: boolean;
  isMobile: boolean;
  confirmed: boolean;
}): boolean {
  if (!freshDataLoaded) return false;
  return isMobile || confirmed;
}
