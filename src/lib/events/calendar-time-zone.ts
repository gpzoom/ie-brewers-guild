import { TZDate } from "@date-fns/tz";

/**
 * A member's Google Calendar must be set to Pacific Time (owner, 2026-11-18).
 * Google writes the calendar's own time zone in the feed's X-WR-TIMEZONE line.
 *
 * - A new or re-saved calendar link set to another zone is refused
 *   (saveIcsConnection, wrongTimeZoneMessage).
 * - Calendars already connected in another zone are converted for now, so the
 *   times the member typed show as Pacific times (ics-sync), and the member and
 *   the Guild see the utc_calendar alert. TEMPORARY: once every connected
 *   calendar reports Pacific, remove pacificWallClockIso's use in ics-sync.
 */
export const PACIFIC_TIME_ZONE = "America/Los_Angeles";

const PACIFIC_NAMES = new Set(["america/los_angeles", "us/pacific", "pst8pdt"]);
const UTC_NAMES = new Set(["utc", "gmt", "etc/utc", "etc/gmt", "etc/uct", "uct", "zulu"]);

/** The feed's X-WR-TIMEZONE value, or null when the header is absent. */
export function feedTimeZone(icsText: string): string | null {
  // A CRLF (or LF) followed by a space or tab continues the previous line.
  const unfolded = icsText.replace(/\r?\n[ \t]/g, "");
  const match = /^X-WR-TIMEZONE(?:;[^:\r\n]*)?:(.*)$/im.exec(unfolded);
  const value = match?.[1].trim();
  return value ? value : null;
}

/** True when the calendar names a zone other than Pacific Time. A feed that names none is left alone. */
export function isWrongTimeZone(zone: string | null): boolean {
  return zone !== null && !PACIFIC_NAMES.has(zone.trim().toLowerCase());
}

export function isUtcName(zone: string | null): boolean {
  return zone !== null && UTC_NAMES.has(zone.trim().toLowerCase());
}

/** How a zone is named to the member. */
export function zoneLabel(zone: string): string {
  return isUtcName(zone) ? "UTC" : zone.trim();
}

export function wrongTimeZoneMessage(zone: string): string {
  return `This Google Calendar is set to ${zoneLabel(zone)}, not Pacific Time. In Google Calendar, open Settings, choose this calendar, and set its Time zone to (GMT-08:00) Pacific Time - Los Angeles. Check that your event times still look right, then save the link here again.`;
}

/** The zone conversion reads times in, or null when the feed's zone is fine or unknown to us. */
export function conversionZone(feedZone: string | null): string | null {
  if (!isWrongTimeZone(feedZone)) return null;
  const zone = isUtcName(feedZone) ? "UTC" : (feedZone as string).trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

export type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

/** The wall-clock time an instant shows in a zone (month 1-12). */
export function wallClockIn(instantMs: number, zone: string): WallClock {
  const t = new TZDate(instantMs, zone);
  return { year: t.getFullYear(), month: t.getMonth() + 1, day: t.getDate(), hour: t.getHours(), minute: t.getMinutes(), second: t.getSeconds() };
}

/** The same wall-clock time, read as Pacific Time, as a UTC ISO string. */
export function pacificWallClockIso(w: WallClock): string {
  const t = new TZDate(w.year, w.month - 1, w.day, w.hour, w.minute, w.second, PACIFIC_TIME_ZONE);
  return new Date(t.getTime()).toISOString();
}
