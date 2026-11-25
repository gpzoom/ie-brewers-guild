/**
 * Pure assembly of the staff-activity screen: database rows in, the safe
 * summary and list pages out. No holder id and no visit id ever leave here.
 */
import {
  customerLabels,
  flagRows,
  rowKey,
  totals,
  wrongTryGroups,
  type ActivityRow,
  type FlagKind,
  type MemberHours,
  type SourceTotal,
} from "@/lib/tap-card/staff-activity";
import type { LocationWord } from "@/lib/tap-card/location";

export type ActivityRange = 7 | 30 | 90 | "all";
export type SummaryRow = SourceTotal & { name: string; removed: boolean };
export type ActivitySummary = {
  rows: SummaryRow[];
  beforeTracking: number;
  wrongTries: { customer: string; day: string; tries: number }[];
};
export type ActivityItem = {
  id: string;
  at: string;
  customer: string;
  event: ActivityRow["event"];
  method: "qr" | "pin";
  reward: string | null;
  location: LocationWord | null;
  flags: FlagKind[];
};
export type StaffPerson = { id: string; name: string; removed: boolean };

export const PAGE_SIZE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
const COUNTER_NAME = "Behind the counter";
const SHARED_NAME = "Shared code";
const REMOVED_NAME = "Removed staff";

/** Anything but 7, 30, 90 or "all" is the 30-day default. */
export function parseRange(value: unknown): ActivityRange {
  return value === 7 || value === 30 || value === 90 || value === "all" ? value : 30;
}

/** ISO time N x 24 hours before now, or null for all time. */
export function rangeStart(range: ActivityRange, now: Date): string | null {
  return range === "all" ? null : new Date(now.getTime() - range * DAY_MS).toISOString();
}

const KEY_PATTERN = /^(counter|staff-code|staff:removed|staff:[0-9A-Za-z_-]{1,64})$/;

/** Whether this is a key rowKey() can produce. */
export function isRowKey(value: unknown): value is string {
  return typeof value === "string" && KEY_PATTERN.test(value);
}

/** Visits that no activity row points at, whenever that row was logged. */
export function countBeforeTracking(visitIds: string[], activityVisitIds: (string | null)[]): number {
  const logged = new Set(activityVisitIds);
  let count = 0;
  for (const id of visitIds) if (!logged.has(id)) count++;
  return count;
}

/** Labels over all of a member's customers (not just a range), so they stay put when the range changes. */
export function labelsFor(memberId: string, holderIdLists: string[][]): Promise<Map<string, string>> {
  return customerLabels(memberId, holderIdLists.flat());
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export function buildSummary(input: {
  rows: ActivityRow[];
  hours: MemberHours;
  staff: StaffPerson[];
  labels: Map<string, string>;
  misses: { holderId: string; at: string }[];
  beforeTracking: number;
}): ActivitySummary {
  const { rows, hours, staff, labels, misses, beforeTracking } = input;
  const flags = flagRows(rows, hours);
  const byKey = new Map(totals(rows, flags).map((t) => [t.key, t]));
  const empty = (key: string): SourceTotal => ({ key, checkIns: 0, rewards: 0, undone: 0, flags: {} });

  const people = staff
    .map((p) => ({ key: `staff:${p.id}`, name: p.name, removed: p.removed }))
    .filter((p) => !p.removed || byKey.has(p.key));
  const active = people.filter((p) => !p.removed).sort(byName);
  const removed = people.filter((p) => p.removed).sort(byName);
  if (byKey.has("staff:removed")) removed.push({ key: "staff:removed", name: REMOVED_NAME, removed: true });

  const ordered = [
    ...active,
    ...removed,
    { key: "counter", name: COUNTER_NAME, removed: false },
    { key: "staff-code", name: SHARED_NAME, removed: false },
  ];
  const wrongTries = wrongTryGroups(misses, hours.timezone)
    .map((g) => ({ customer: labels.get(g.holderId) ?? "Customer", day: g.day, tries: g.tries }))
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.tries - a.tries || a.customer.localeCompare(b.customer)));

  return {
    rows: ordered.map((o) => ({ ...(byKey.get(o.key) ?? empty(o.key)), name: o.name, removed: o.removed })),
    beforeTracking,
    wrongTries,
  };
}

/** One page of one source's rows, newest first. Flags use every row passed in, not just the page. */
export function buildPage(input: {
  rows: ActivityRow[];
  hours: MemberHours;
  labels: Map<string, string>;
  key: unknown;
  offset: unknown;
}): { items: ActivityItem[]; more: boolean } {
  const { key } = input;
  if (!isRowKey(key)) return { items: [], more: false };
  const offset = typeof input.offset === "number" && Number.isFinite(input.offset) ? Math.max(0, Math.floor(input.offset)) : 0;

  const flags = flagRows(input.rows, input.hours);
  const mine = input.rows
    .filter((r) => rowKey(r) === key)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  const items = mine.slice(offset, offset + PAGE_SIZE).map(
    (r): ActivityItem => ({
      id: r.id,
      at: r.at,
      customer: input.labels.get(r.holderId) ?? "Customer",
      event: r.event,
      method: r.method,
      reward: r.reward,
      location: r.location,
      flags: flags.get(r.id) ?? [],
    }),
  );
  return { items, more: mine.length > offset + PAGE_SIZE };
}
