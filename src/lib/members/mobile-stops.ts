import { getZonedNow } from "@/lib/hours/open-now";

/**
 * A mobile member's stops (their events) on the Members page v2
 * (spec "Mobile members: today's stop"). Pure: the server loads the rows
 * and passes `now`.
 */
export const STOP_TIMEZONE = "America/Los_Angeles";

export const STOP_EVENT_COLUMNS =
  "id, member_id, title, venue_name, city, address, starts_at, ends_at, all_day, overlay_status, overlay_starts_at, is_hidden, latitude, longitude, geocoded_address";

export type StopEvent = {
  id: string;
  member_id: string;
  title: string | null;
  venue_name: string | null;
  city: string | null;
  address: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  overlay_status: "postponed" | "rescheduled" | "canceled" | null;
  overlay_starts_at: string | null;
  is_hidden: boolean;
  latitude: number | string | null;
  longitude: number | string | null;
  geocoded_address: string | null;
};

const DEFAULT_LENGTH_MS = 2 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

function pacificDate(instant: Date): string {
  return getZonedNow(instant, STOP_TIMEZONE).date;
}

/** A rescheduled stop counts by its new start time. */
export function stopStart(e: StopEvent): string {
  return e.overlay_status === "rescheduled" && e.overlay_starts_at ? e.overlay_starts_at : e.starts_at;
}

function stopEnd(e: StopEvent): number {
  const start = new Date(stopStart(e)).getTime();
  if (e.all_day) return start + DAY_MS;
  if (e.ends_at && e.overlay_status !== "rescheduled") {
    const end = new Date(e.ends_at).getTime();
    if (end > start) return end;
  }
  return start + DEFAULT_LENGTH_MS;
}

function isLive(e: StopEvent): boolean {
  return !e.is_hidden && e.overlay_status !== "canceled" && e.overlay_status !== "postponed";
}

function byStart(a: StopEvent, b: StopEvent): number {
  return stopStart(a).localeCompare(stopStart(b));
}

export function pickTodaysStop(events: StopEvent[], now: Date): StopEvent | null {
  const today = pacificDate(now);
  const t = now.getTime();
  const todays = events
    .filter(isLive)
    .filter((e) => pacificDate(new Date(stopStart(e))) === today)
    .sort(byStart);
  const happening = todays.find((e) => new Date(stopStart(e)).getTime() <= t && t < stopEnd(e));
  if (happening) return happening;
  return todays.find((e) => new Date(stopStart(e)).getTime() > t) ?? null;
}

export function pickNextStop(events: StopEvent[], now: Date, days = 14): StopEvent | null {
  const today = pacificDate(now);
  const limit = now.getTime() + days * DAY_MS;
  return (
    events
      .filter(isLive)
      .filter((e) => pacificDate(new Date(stopStart(e))) > today && new Date(stopStart(e)).getTime() <= limit)
      .sort(byStart)[0] ?? null
  );
}

function hourText(instant: Date): { text: string; period: "am" | "pm" } {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: STOP_TIMEZONE,
  }).formatToParts(instant);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const period = (parts.find((p) => p.type === "dayPeriod")?.value ?? "PM").toLowerCase() as "am" | "pm";
  return { text: minute === "00" ? hour : `${hour}:${minute}`, period };
}

/** "5–9 pm", "5:30–9 pm", "11 am–2 pm", "6 pm", "All day". */
export function formatStopTime(e: StopEvent): string {
  if (e.all_day) return "All day";
  const start = hourText(new Date(stopStart(e)));
  const hasEnd = Boolean(e.ends_at) && e.overlay_status !== "rescheduled";
  if (!hasEnd) return `${start.text} ${start.period}`;
  const end = hourText(new Date(e.ends_at as string));
  return start.period === end.period
    ? `${start.text}–${end.text} ${end.period}`
    : `${start.text} ${start.period}–${end.text} ${end.period}`;
}

/** "Fri". */
export function formatStopDay(e: StopEvent): string {
  return new Date(stopStart(e)).toLocaleDateString("en-US", { weekday: "short", timeZone: STOP_TIMEZONE });
}

export type HostLocation = { name: string; slug: string; city: string; street: string | null; lat: number; lng: number };

export type StopPlacement =
  | { kind: "member"; host: HostLocation; lat: number; lng: number }
  | { kind: "address"; lat: number; lng: number }
  | { kind: "none" };

/** The mobile pin sits this far east of the host's pin (~80 m) so both show. */
export const MOBILE_PIN_OFFSET_LNG = 0.0009;

export function normalizeBusinessName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'’]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+(co|company)$/, "")
    .trim();
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function toNumber(value: number | string | null): number | null {
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** The stop's own coordinates -- only while they belong to its current address. */
export function stopCoordinates(e: StopEvent): { lat: number; lng: number } | null {
  if (!clean(e.address) || clean(e.geocoded_address) !== clean(e.address)) return null;
  const lat = toNumber(e.latitude);
  const lng = toNumber(e.longitude);
  return lat === null || lng === null ? null : { lat, lng };
}

export type HostCandidate = { id: string; name: string; slug: string; city: string; street: string | null };

/** Which taproom a stop is at: by venue name, else by street address; several locations -> the one in the stop's city. */
export function matchHost<T extends { name: string; city: string; street: string | null }>(
  e: Pick<StopEvent, "venue_name" | "address" | "city">,
  hosts: T[],
): T | null {
  const venue = clean(e.venue_name);
  const address = clean(e.address).toLowerCase();
  const byName = venue ? hosts.filter((h) => normalizeBusinessName(h.name) === normalizeBusinessName(venue)) : [];
  const byStreet = address ? hosts.filter((h) => h.street && address.startsWith(h.street.trim().toLowerCase())) : [];
  const candidates = byName.length ? byName : byStreet;
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    const city = clean(e.city).toLowerCase();
    return candidates.find((h) => city && h.city.trim().toLowerCase() === city) ?? null;
  }
  return null;
}

export function placeStop(e: StopEvent, hosts: HostLocation[]): StopPlacement {
  const host = matchHost(e, hosts);
  if (host) return { kind: "member", host, lat: host.lat, lng: host.lng + MOBILE_PIN_OFFSET_LNG };
  const own = stopCoordinates(e);
  if (own) return { kind: "address", ...own };
  return { kind: "none" };
}

export type StopSummary =
  | { state: "at-member"; hostName: string; time: string }
  | { state: "at-address"; venue: string; address: string; time: string }
  | { state: "in-city"; place: string | null; time: string }
  | { state: "next"; day: string; city: string | null }
  | { state: "none" };

export function summarizeStops(
  events: StopEvent[],
  hosts: HostLocation[],
  now: Date,
): { summary: StopSummary; placement: StopPlacement; city: string | null } {
  const todays = pickTodaysStop(events, now);
  if (todays) {
    const placement = placeStop(todays, hosts);
    const time = formatStopTime(todays);
    if (placement.kind === "member") {
      return { summary: { state: "at-member", hostName: placement.host.name, time }, placement, city: placement.host.city };
    }
    if (placement.kind === "address") {
      return {
        summary: {
          state: "at-address",
          venue: clean(todays.venue_name) || clean(todays.title) || clean(todays.address),
          address: clean(todays.address),
          time,
        },
        placement,
        city: clean(todays.city) || null,
      };
    }
    return {
      summary: { state: "in-city", place: clean(todays.city) || clean(todays.venue_name) || null, time },
      placement,
      city: clean(todays.city) || null,
    };
  }
  const next = pickNextStop(events, now);
  if (next) {
    return { summary: { state: "next", day: formatStopDay(next), city: clean(next.city) || null }, placement: { kind: "none" }, city: null };
  }
  return { summary: { state: "none" }, placement: { kind: "none" }, city: null };
}

const LOOKUP_WINDOW_HOURS = 48;

/** The cron looks a stop up when it has a street address (a number in it), starts within 48 hours, and isn't looked up for this address yet. */
export function needsStopGeocode(e: StopEvent, now: Date, hours = LOOKUP_WINDOW_HOURS): boolean {
  const address = clean(e.address);
  if (!address || !/\d/.test(address)) return false;
  if (clean(e.geocoded_address) === address) return false;
  const start = new Date(stopStart(e)).getTime();
  // Still on or yet to come (a stop added after it started still gets its pin).
  return stopEnd(e) > now.getTime() && start <= now.getTime() + hours * 3600 * 1000;
}
