/** Wording and date formats for the Staff activity box. Pure, so it's tested. */
import type { LocationWord } from "@/lib/tap-card/location";
import type { FlagKind } from "@/lib/tap-card/staff-activity";
import type { ActivityRange } from "@/lib/tap-card/staff-activity-view";
import { TAP_CARD_TZ } from "@/lib/tap-card/tap-card-time";

export const ACTIVITY_RANGES: { value: ActivityRange; label: string }[] = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const FLAG_LABELS: Record<FlagKind, string> = {
  "outside-hours": "outside open hours",
  far: "far from the taproom",
  "no-location": "no location",
  burst: "close together",
  "same-customer": "same customer",
  "turned-off-code": "turned-off QR used",
};

export const FLAG_ORDER: FlagKind[] = ["outside-hours", "far", "no-location", "burst", "same-customer", "turned-off-code"];

/** "6 outside open hours", or the bare label with no count. */
export function flagText(kind: FlagKind, count?: number): string {
  return count === undefined ? FLAG_LABELS[kind] : `${count} ${FLAG_LABELS[kind]}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "42 check-ins · 9 rewards · 1 undone"; undone is left out at zero. */
export function totalsText(t: { checkIns: number; rewards: number; undone: number }): string {
  const parts = [plural(t.checkIns, "check-in", "check-ins"), plural(t.rewards, "reward", "rewards")];
  if (t.undone > 0) parts.push(`${t.undone} undone`);
  return parts.join(" · ");
}

/** Nothing to list. A turned-off QR scan has no counts, so flags keep a row too. */
export function isActivityEmpty(s: {
  rows: { checkIns: number; rewards: number; undone: number; flags: Partial<Record<FlagKind, number>> }[];
  beforeTracking: number;
}): boolean {
  return (
    s.beforeTracking === 0 &&
    s.rows.every((r) => r.checkIns + r.rewards + r.undone === 0 && Object.values(r.flags).every((n) => n === 0))
  );
}

export type ActivityEvent = "check-in" | "reward-used" | "reward-undone" | "turned-off-code";

export function eventLabel(event: ActivityEvent): string {
  switch (event) {
    case "check-in":
      return "Check-in";
    case "reward-used":
      return "Reward used";
    case "reward-undone":
      return "Reward undone";
    default:
      return "Turned-off QR scanned";
  }
}

/** "QR" or "4-digit code"; nothing for the counter or a turned-off scan. */
export function methodLabel(method: "qr" | "pin", event: ActivityEvent, key: string): string | null {
  if (key === "counter" || event === "turned-off-code") return null;
  return method === "pin" ? "4-digit code" : "QR";
}

/** Where the customer's phone said it was; nothing where it isn't judged. */
export function locationLabel(word: LocationWord | null): string | null {
  return word === null ? null : { near: "Near", far: "Far away", none: "No location" }[word];
}

export function personName(name: string, removed: boolean): string {
  return removed && name !== "Removed staff" ? `${name} (removed)` : name;
}

function pacificYear(at: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TAP_CARD_TZ, year: "numeric" }).format(at);
}

/** "Nov 23, 2:14 PM" in Pacific, with the year when it isn't this one; "" if the value isn't a date. */
export function formatActivityTime(iso: string, now: Date): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TAP_CARD_TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = get("year") === pacificYear(now) ? "" : ` ${get("year")},`;
  return `${get("month")} ${get("day")},${year} ${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-22" -> "Nov 22", or "Nov 22, 2026" in another year. */
export function formatActivityDay(day: string, now: Date): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const shown = `${MONTHS[Number(m[2]) - 1] ?? ""} ${Number(m[3])}`;
  return m[1] === pacificYear(now) ? shown : `${shown}, ${m[1]}`;
}
