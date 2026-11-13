import type { MemberNotificationRow } from "@/lib/supabase/types";
import { escapeHtml } from "./email";
import { typeDef } from "./registry";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type WeekCounts = { found: number; resolved: number; open: number };

/**
 * The key a row counts under: a shared conflict (the guest's and the host's
 * rows) counts once by event + date; anything else by its dedupe key.
 */
function countKey(r: MemberNotificationRow): string {
  if (r.type === "closed_day_conflict" && r.event_id) return `cdc:${r.event_id}:${r.due_date ?? ""}`;
  return `${r.type}:${r.dedupe_key ?? r.id}`;
}

function counts(r: MemberNotificationRow): boolean {
  try {
    return typeDef(r.type).countsInGuildSummary;
  } catch {
    return false;
  }
}

/** Found / resolved in the last 7 days, and still open now. Pure. */
export function countWeek(rows: MemberNotificationRow[], now: Date): WeekCounts {
  const since = now.getTime() - WEEK_MS;
  const found = new Set<string>();
  const resolved = new Set<string>();
  const open = new Set<string>();
  for (const r of rows) {
    if (r.kind !== "problem" || !counts(r)) continue;
    const key = countKey(r);
    if (new Date(r.created_at).getTime() >= since) found.add(key);
    if (r.resolved_at && new Date(r.resolved_at).getTime() >= since) resolved.add(key);
    if (r.status === "open") open.add(key);
  }
  return { found: found.size, resolved: resolved.size, open: open.size };
}

/** True on Monday in Pacific time (the weekly summary day). */
export function isMondayPacific(now: Date): boolean {
  return (
    new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Los_Angeles" }).format(
      now,
    ) === "Mon"
  );
}

type Email = { subject: string; html: string; text: string };

const WRAP = "font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #241F1A;";
const BUTTON =
  "display: inline-block; padding: 10px 18px; background: #BE5A0A; color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600;";

export function buildWeeklySummaryEmail(
  c: WeekCounts,
  origin: string,
  staging: boolean,
): Email | null {
  if (c.found === 0 && c.resolved === 0 && c.open === 0) return null;
  const url = `${origin}/guild/alerts`;
  const line = `This week: ${c.found} conflicts found, ${c.resolved} resolved, ${c.open} still open.`;
  return {
    subject: `${staging ? "[Staging] " : ""}Member alerts this week: ${c.found} found, ${c.resolved} resolved`,
    text: [line, `See them all: ${url}`].join("\n\n"),
    html: `<div style="${WRAP}"><p>${escapeHtml(line)}</p><p><a href="${escapeHtml(url)}" style="${BUTTON}">See the alerts</a></p></div>`,
  };
}

export type LaunchNames = {
  members: Record<string, string>;
  events: Record<string, string>;
};

const TYPE_LABEL: Record<string, string> = {
  closed_day_conflict: "Events on a closed day",
  utc_calendar: "Calendars set to UTC",
};

function whenText(r: MemberNotificationRow): string {
  if (r.due_date) {
    const [y, m, d] = r.due_date.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, d)));
  }
  return "ongoing";
}

/** The one-time launch summary: open problems found quietly, not emailed. */
export function buildLaunchSummaryEmail(
  rows: MemberNotificationRow[],
  names: LaunchNames,
  origin: string,
  staging: boolean,
): Email {
  const quiet = rows.filter((r) => r.kind === "problem" && r.quiet && r.status === "open");
  // One entry per conflict: a shared pair lists both members together.
  const entries = new Map<
    string,
    { type: string; members: string[]; what: string; when: string; hidden: boolean }
  >();
  for (const r of quiet) {
    const key = countKey(r);
    const member = names.members[r.member_id] ?? "A member";
    const e = entries.get(key);
    if (e) {
      if (!e.members.includes(member)) e.members.push(member);
      continue;
    }
    const isEvent = r.type === "closed_day_conflict" && !!r.event_id;
    const purpose = (r.details as { purpose?: string }).purpose;
    entries.set(key, {
      type: r.type,
      members: [member],
      what: isEvent
        ? (names.events[r.event_id as string] ?? "an event")
        : `${purpose === "food" ? "food" : "events"} calendar`,
      when: whenText(r),
      hidden: isEvent,
    });
  }
  const list = [...entries.values()];
  const byType = new Map<string, number>();
  for (const e of list) byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
  const typeLines = [...byType].map(([t, n]) => `${TYPE_LABEL[t] ?? t}: ${n}`);
  const itemLines = list.map(
    (e) => `${e.members.join(" and ")}: ${e.what}, ${e.when}${e.hidden ? " (hidden)" : ""}`,
  );
  const url = `${origin}/guild/alerts`;
  const notEmailed = "These members were not emailed.";
  const intro = `Member alerts are live. ${list.length} conflicts were found at launch.`;
  const li = (l: string) => `<li>${escapeHtml(l)}</li>`;

  return {
    subject: `${staging ? "[Staging] " : ""}Member alerts are live: ${list.length} found at launch`,
    text: [
      intro,
      typeLines.join("\n"),
      itemLines.map((l) => `- ${l}`).join("\n"),
      notEmailed,
      `See them all: ${url}`,
    ].join("\n\n"),
    html: `<div style="${WRAP}"><p>${escapeHtml(intro)}</p><ul>${typeLines.map(li).join("")}</ul><ul>${itemLines.map(li).join("")}</ul><p><strong>${notEmailed}</strong></p><p><a href="${escapeHtml(url)}" style="${BUTTON}">See the alerts</a></p></div>`,
  };
}
