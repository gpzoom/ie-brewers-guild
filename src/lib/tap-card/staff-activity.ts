/**
 * Pure rules for the staff-activity screen: which rows are worth a look
 * ("flags"), per-source totals, wrong-code groups and anonymous customer
 * labels. Nothing here reads the database or sends anything to a browser.
 */
import { computeOpenNow, getZonedNow, type SpecialHoursDay, type WeekdayHours } from "@/lib/hours/open-now";
import type { LocationWord } from "@/lib/tap-card/location";

export const FLAG_LIMITS = {
  graceMinutes: 60,
  burstCustomers: 4,
  burstMinutes: 5,
  sameVisits: 5,
  sameShare: 0.8,
  wrongTries: 5,
  noLocationVisits: 3,
} as const;

export type ActivityRow = {
  id: string;
  holderId: string;
  visitId: string | null;
  at: string;
  event: "check-in" | "reward-used" | "reward-undone" | "turned-off-code";
  source: "staff" | "counter" | "staff-code";
  staffId: string | null;
  method: "qr" | "pin";
  reward: string | null;
  /** Null where it isn't judged (food trucks, no saved coordinates, undos, older rows). */
  location: LocationWord | null;
};

export type FlagKind = "outside-hours" | "far" | "no-location" | "burst" | "same-customer" | "turned-off-code";

export type MemberHours = { timezone: string; hours: WeekdayHours[]; specialHours: SpecialHoursDay[] };

export type SourceTotal = {
  key: string;
  checkIns: number;
  rewards: number;
  undone: number;
  flags: Partial<Record<FlagKind, number>>;
};

const MINUTE_MS = 60_000;

/**
 * "staff:<id>" for a named person, "staff:removed" for a staff event whose
 * person was deleted, otherwise "counter" or "staff-code" (shared).
 */
export function rowKey(r: ActivityRow): string {
  if (r.source === "staff") return r.staffId ? `staff:${r.staffId}` : "staff:removed";
  return r.source === "counter" ? "counter" : "staff-code";
}

/** A named person's own QR or 4-digit code (not the counter, not the shared code). */
function isPersonal(r: ActivityRow): r is ActivityRow & { staffId: string } {
  return r.source === "staff" && !!r.staffId;
}

function addFlag(flags: Map<string, FlagKind[]>, id: string, kind: FlagKind) {
  const list = flags.get(id);
  if (!list) flags.set(id, [kind]);
  else if (!list.includes(kind)) list.push(kind);
}

/** True when the member is never "closed" within the grace window around t. */
function makeWithinHours(hours: MemberHours): (ms: number) => boolean | null {
  if (hours.hours.length === 0 && hours.specialHours.length === 0) return () => null;
  // computeOpenNow works to the minute, so one answer per epoch minute.
  const openAtMinute = new Map<number, boolean>();
  const isOpen = (ms: number): boolean => {
    const bucket = Math.floor(ms / MINUTE_MS);
    let open = openAtMinute.get(bucket);
    if (open === undefined) {
      const result = computeOpenNow({
        now: new Date(ms),
        timezone: hours.timezone,
        hours: hours.hours,
        specialHours: hours.specialHours,
      });
      open = result.status !== "closed";
      openAtMinute.set(bucket, open);
    }
    return open;
  };
  const grace = FLAG_LIMITS.graceMinutes * MINUTE_MS;
  return (ms) => {
    if (isOpen(ms)) return true;
    // Open ends are exclusive, so "exactly 60 minutes after close" is probed
    // 1 ms earlier to land on the last open minute.
    if (isOpen(ms + grace) || isOpen(ms - grace - 1)) return true;
    for (let offset = 15; offset < FLAG_LIMITS.graceMinutes; offset += 15) {
      if (isOpen(ms + offset * MINUTE_MS) || isOpen(ms - offset * MINUTE_MS)) return true;
    }
    return false;
  };
}

/**
 * The red dot on the confirmation screen: this visit's check-in or reward was
 * far away, had no location, or was outside open hours. Unlike the activity
 * list, one "no location" is enough (owner, 2026-11-25).
 */
export function visitFlagged(events: Pick<ActivityRow, "at" | "location">[], hours: MemberHours): boolean {
  const withinHours = makeWithinHours(hours);
  return events.some((e) => e.location === "far" || e.location === "none" || withinHours(Date.parse(e.at)) === false);
}

export function flagRows(rows: ActivityRow[], hours: MemberHours): Map<string, FlagKind[]> {
  const flags = new Map<string, FlagKind[]>();
  if (rows.length === 0) return flags;

  const withinHours = makeWithinHours(hours);
  const checkIns: { row: ActivityRow; ms: number }[] = [];

  for (const row of rows) {
    if (row.event === "turned-off-code") {
      addFlag(flags, row.id, "turned-off-code");
      continue;
    }
    const ms = Date.parse(row.at);
    if (Number.isNaN(ms)) continue;
    if (row.event === "check-in") checkIns.push({ row, ms });
    if (row.event === "check-in" || row.event === "reward-used") {
      if (withinHours(ms) === false) addFlag(flags, row.id, "outside-hours");
    }
  }

  // Several at once: per person, sliding window over time-sorted check-ins.
  const byStaff = new Map<string, { row: ActivityRow; ms: number }[]>();
  for (const entry of checkIns) {
    if (!isPersonal(entry.row)) continue;
    const list = byStaff.get(entry.row.staffId);
    if (list) list.push(entry);
    else byStaff.set(entry.row.staffId, [entry]);
  }
  const windowMs = FLAG_LIMITS.burstMinutes * MINUTE_MS;
  for (const list of byStaff.values()) {
    list.sort((a, b) => a.ms - b.ms);
    const counts = new Map<string, number>();
    const diff = new Array<number>(list.length + 1).fill(0);
    let left = 0;
    for (let right = 0; right < list.length; right++) {
      const holder = list[right].row.holderId;
      counts.set(holder, (counts.get(holder) ?? 0) + 1);
      while (list[right].ms - list[left].ms > windowMs) {
        const gone = list[left].row.holderId;
        const n = (counts.get(gone) ?? 1) - 1;
        if (n === 0) counts.delete(gone);
        else counts.set(gone, n);
        left++;
      }
      // The leftmost window ending here contains every qualifying sub-window.
      if (counts.size >= FLAG_LIMITS.burstCustomers) {
        diff[left] += 1;
        diff[right + 1] -= 1;
      }
    }
    let running = 0;
    for (let i = 0; i < list.length; i++) {
      running += diff[i];
      if (running > 0) addFlag(flags, list[i].row.id, "burst");
    }
  }

  // Same customer, same person: all of one person's codes count together.
  const byHolder = new Map<string, { total: number; perStaff: Map<string, ActivityRow[]> }>();
  for (const { row } of checkIns) {
    let entry = byHolder.get(row.holderId);
    if (!entry) {
      entry = { total: 0, perStaff: new Map() };
      byHolder.set(row.holderId, entry);
    }
    entry.total++;
    if (isPersonal(row)) {
      const list = entry.perStaff.get(row.staffId);
      if (list) list.push(row);
      else entry.perStaff.set(row.staffId, [row]);
    }
  }
  for (const { total, perStaff } of byHolder.values()) {
    if (total < FLAG_LIMITS.sameVisits) continue;
    for (const list of perStaff.values()) {
      if (list.length / total >= FLAG_LIMITS.sameShare) {
        for (const row of list) addFlag(flags, row.id, "same-customer");
      }
    }
  }

  // Far, one at a time; no location, only as a pattern with nothing near.
  const located = new Map<string, ActivityRow[]>();
  for (const { row } of checkIns) {
    if (row.location === null) continue;
    if (row.location === "far") addFlag(flags, row.id, "far");
    const list = located.get(row.holderId);
    if (list) list.push(row);
    else located.set(row.holderId, [row]);
  }
  for (const list of located.values()) {
    if (list.length < FLAG_LIMITS.noLocationVisits || list.some((r) => r.location === "near")) continue;
    for (const row of list) if (row.location === "none") addFlag(flags, row.id, "no-location");
  }

  return flags;
}

export function totals(rows: ActivityRow[], flags: Map<string, FlagKind[]>): SourceTotal[] {
  const byKey = new Map<string, SourceTotal>();
  for (const row of rows) {
    const key = rowKey(row);
    let total = byKey.get(key);
    if (!total) {
      total = { key, checkIns: 0, rewards: 0, undone: 0, flags: {} };
      byKey.set(key, total);
    }
    if (row.event === "check-in") total.checkIns++;
    else if (row.event === "reward-used") total.rewards++;
    else if (row.event === "reward-undone") total.undone++;
    for (const kind of flags.get(row.id) ?? []) {
      total.flags[kind] = (total.flags[kind] ?? 0) + 1;
    }
  }
  return [...byKey.values()];
}

/** Customers with 5 or more wrong-code tries in one local day at the member. */
export function wrongTryGroups(
  misses: { holderId: string; at: string }[],
  timezone: string,
): { holderId: string; day: string; tries: number }[] {
  const counts = new Map<string, { holderId: string; day: string; tries: number }>();
  for (const miss of misses) {
    const ms = Date.parse(miss.at);
    if (Number.isNaN(ms)) continue;
    const day = getZonedNow(new Date(ms), timezone).date;
    const key = `${miss.holderId}|${day}`;
    const entry = counts.get(key);
    if (entry) entry.tries++;
    else counts.set(key, { holderId: miss.holderId, day, tries: 1 });
  }
  return [...counts.values()].filter((g) => g.tries >= FLAG_LIMITS.wrongTries);
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * Anonymous per-member labels: "Customer " plus the first 3+ hex digits of
 * SHA-256(memberId:holderId). Labels that would collide are lengthened until
 * unique, judged over the ids passed in.
 */
export async function customerLabels(memberId: string, holderIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(holderIds)];
  const hashes = new Map<string, string>();
  await Promise.all(ids.map(async (id) => hashes.set(id, await sha256Hex(`${memberId}:${id}`))));

  const lengths = new Map(ids.map((id) => [id, 3]));
  for (let guard = 0; guard < 64; guard++) {
    const groups = new Map<string, string[]>();
    for (const id of ids) {
      const prefix = (hashes.get(id) as string).slice(0, lengths.get(id));
      const list = groups.get(prefix);
      if (list) list.push(id);
      else groups.set(prefix, [id]);
    }
    let collided = false;
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      for (const id of group) {
        const next = (lengths.get(id) as number) + 1;
        if (next <= 64) {
          lengths.set(id, next);
          collided = true;
        }
      }
    }
    if (!collided) break;
  }

  return new Map(ids.map((id) => [id, `Customer ${(hashes.get(id) as string).slice(0, lengths.get(id))}`]));
}
