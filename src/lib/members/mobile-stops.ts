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
