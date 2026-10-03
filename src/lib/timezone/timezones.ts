import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";

/**
 * Real IANA timezone list, sourced from the JS engine's own tz database via
 * Intl.supportedValuesOf -- never hardcode a static list, since the set of
 * valid IANA zone names changes over time. Standard ECMA-402, available
 * identically in the Cloudflare Workers runtime, Node, and every browser
 * this admin panel targets.
 */
export function listIanaTimezones(): string[] {
  return Intl.supportedValuesOf("timeZone");
}

export function isValidIanaTimezone(value: string): boolean {
  return listIanaTimezones().includes(value);
}

const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

/**
 * Converts a UTC ISO timestamp (e.g. from a `starts_at` column) into the
 * "yyyy-MM-ddTHH:mm" wall-clock string a `datetime-local` input expects,
 * in the GIVEN IANA timezone -- never the browser's/server's own local
 * zone. `event.starts_at.slice(0, 16)` or plain `Date` getters would both
 * implicitly report time in the runtime's system timezone, which is wrong
 * the moment a member (or, for Task 26's ICS sync, a feed) is being
 * viewed/edited from a different timezone than the member's actual
 * business timezone.
 *
 * `TZDate`'s single-STRING constructor form is safe here because the
 * input always carries an explicit UTC designator (a `Z`-suffixed ISO
 * string) -- unlike parseDatetimeLocal below, there's no ambiguity for it
 * to resolve using the system timezone.
 */
export function toDatetimeLocalValue(isoUtc: string, timezone: string): string {
  return format(new TZDate(isoUtc, timezone), DATETIME_LOCAL_FORMAT);
}

/**
 * The inverse of toDatetimeLocalValue: takes a naive "yyyy-MM-ddTHH:mm"
 * wall-clock string (no offset -- exactly what a `datetime-local` input,
 * or an ICS feed's DTSTART paired with a separate TZID, produces) and
 * returns the correct UTC ISO instant for that wall-clock time IN THE
 * GIVEN TIMEZONE.
 *
 * IMPORTANT: `new TZDate(value, timezone)` -- TZDate's single-STRING
 * constructor form -- is NOT actually timezone-aware for a naive string
 * like this one. Per @date-fns/tz's own source
 * (node_modules/@date-fns/tz/date/mini.js's constructor), a string
 * argument falls straight through to `+new Date(str)`, and ECMA-262
 * specifies that a date-time string with no timezone designator is
 * parsed as local time in the CURRENT SYSTEM timezone -- exactly the
 * browser-timezone bug this function exists to avoid. Verified
 * empirically: constructing `new TZDate("2026-10-05T18:00",
 * "America/Los_Angeles")` produces a DIFFERENT instant depending on the
 * system's own timezone (checked against America/New_York, UTC,
 * Asia/Tokyo, and America/Los_Angeles as the system zone), even though
 * the target-timezone argument never changes -- i.e. the single-string
 * form reintroduces the exact bug it looks like it fixes.
 *
 * TZDate's NUMERIC multi-argument constructor form (`new TZDate(year,
 * monthIndex, day, hours, minutes, timezone)`) goes through a different
 * path (`adjustToSystemTZ`) that correctly reconciles the given
 * wall-clock components against the target zone regardless of the
 * system timezone -- verified to produce the identical instant across
 * all 4 system zones above, including across DST transitions. So the
 * value's components are parsed out and passed as separate numeric
 * args, never as one naive string.
 *
 * The result is re-wrapped through a plain `Date` before calling
 * `.toISOString()` -- `TZDate`'s OWN `.toISOString()` returns an
 * offset-suffixed form (e.g. "...-07:00") rather than the standard
 * `Z`-suffixed one. Both represent the identical instant, but every
 * DB-sourced `starts_at` value (Postgres/PostgREST) is always reported
 * in `Z` form, and comparing/sorting the two string forms directly
 * (e.g. an optimistically-added row's `starts_at` against
 * server-sourced ones) would otherwise mis-order despite representing
 * the same instants. `new Date(zoned.getTime()).toISOString()` is a
 * plain, un-zoned `Date`, so its `.toISOString()` is always the
 * standard `Z` form.
 *
 * Throws if `value` isn't a complete "yyyy-MM-ddTHH:mm"-shaped string
 * (e.g. `""` from a cleared/incomplete `datetime-local` input) --
 * callers must guard for that themselves (e.g. `if (!value) return;`)
 * rather than relying on this function to fail silently.
 */
export function fromDatetimeLocalValue(value: string, timezone: string): string {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = (datePart ?? "").split("-").map(Number);
  const [hours, minutes] = (timePart ?? "").split(":").map(Number);
  if ([year, month, day, hours, minutes].some((n) => n === undefined || Number.isNaN(n))) {
    throw new Error("Invalid date/time.");
  }
  const zoned = new TZDate(year, month - 1, day, hours, minutes, timezone);
  return new Date(zoned.getTime()).toISOString();
}
