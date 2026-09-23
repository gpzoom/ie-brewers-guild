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
export function computeHoursConfirmationBadge(hoursConfirmedAt: string | null, now: Date = new Date()): HoursConfirmationBadge {
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
export function isEveryAppearanceInThePast(appearanceStartTimes: string[], now: Date = new Date()): boolean {
  if (appearanceStartTimes.length === 0) return true;
  return appearanceStartTimes.every((start) => new Date(start).getTime() < now.getTime());
}
