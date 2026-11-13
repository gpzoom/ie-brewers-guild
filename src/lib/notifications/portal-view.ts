import type { MemberNotificationRow } from "@/lib/supabase/types";
import { typeDef } from "./registry";
import type { NoticeContext } from "./types";

/**
 * The portal's and /admin's Notifications area, as pure logic: the list's
 * groups, the menu count and the banner (spec 2026-11-13, "The member
 * portal: Notifications"). The server file reads the rows; this file decides
 * what they look like.
 */

/** Resolved problems and read messages stay listed this long. */
export const NOTIFICATION_HISTORY_DAYS = 30;

export type NotificationListRow = Pick<
  MemberNotificationRow,
  "id" | "type" | "kind" | "status" | "details" | "created_at" | "resolved_at" | "read_at"
>;

export type NotificationItem = {
  id: string;
  type: string;
  kind: MemberNotificationRow["kind"];
  status: MemberNotificationRow["status"];
  /** When it was found (open, unread) or resolved / read (history). */
  when: string;
  title: string;
  body: string;
  buttons: Array<{ label: string; to: string }>;
};

export type NotificationGroups = {
  /** Problems still open. */
  open: NotificationItem[];
  /** Messages not read yet. */
  unread: NotificationItem[];
  /** Resolved problems and read messages from the last 30 days, faded. */
  history: NotificationItem[];
};

export type NotificationSummary = {
  openProblems: number;
  unreadMessages: number;
  /** The banner's sentence, or null for no banner (open problems only). */
  bannerText: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function wording(row: NotificationListRow, ctx: NoticeContext) {
  try {
    return typeDef(row.type).portal(row.details, ctx);
  } catch {
    // An unregistered type (or bad details) still lists rather than blanking the screen.
    return { title: "Notification", body: "", buttons: [] };
  }
}

function historyTime(row: NotificationListRow): string {
  return row.resolved_at ?? row.read_at ?? row.created_at;
}

const newestFirst = (a: NotificationItem, b: NotificationItem) =>
  Date.parse(b.when) - Date.parse(a.when);

export function shapeNotifications(
  rows: readonly NotificationListRow[],
  now: Date,
  ctxFor: (row: NotificationListRow) => NoticeContext,
): NotificationGroups {
  const cutoff = now.getTime() - NOTIFICATION_HISTORY_DAYS * DAY_MS;
  const groups: NotificationGroups = { open: [], unread: [], history: [] };
  for (const row of rows) {
    const isHistory = row.status === "resolved" || row.status === "read";
    const when = isHistory ? historyTime(row) : row.created_at;
    if (isHistory && Date.parse(when) < cutoff) continue;
    const item: NotificationItem = {
      id: row.id,
      type: row.type,
      kind: row.kind,
      status: row.status,
      when,
      ...wording(row, ctxFor(row)),
    };
    if (row.status === "open") groups.open.push(item);
    else if (row.status === "unread") groups.unread.push(item);
    else groups.history.push(item);
  }
  groups.open.sort(newestFirst);
  groups.unread.sort(newestFirst);
  groups.history.sort(newestFirst);
  return groups;
}

function eventsSentence(count: number, whose: string): string {
  return count === 1
    ? `1 of your events is on a day ${whose} marked closed.`
    : `${count} of your events are on a day ${whose} marked closed.`;
}

export function summarizeNotifications(
  rows: ReadonlyArray<Pick<NotificationListRow, "type" | "kind" | "status" | "details">>,
): NotificationSummary {
  let openProblems = 0;
  let unreadMessages = 0;
  let ownConflicts = 0;
  let guestConflicts = 0;
  let utcCalendars = 0;
  for (const row of rows) {
    if (row.kind === "message") {
      if (row.status === "unread") unreadMessages += 1;
      continue;
    }
    if (row.status !== "open") continue;
    openProblems += 1;
    if (row.type === "closed_day_conflict") {
      if ((row.details as { role?: string } | null)?.role === "guest") guestConflicts += 1;
      else ownConflicts += 1;
    } else if (row.type === "utc_calendar") {
      utcCalendars += 1;
    }
  }
  if (openProblems === 0) return { openProblems, unreadMessages, bannerText: null };

  const parts: string[] = [];
  if (ownConflicts > 0) parts.push(eventsSentence(ownConflicts, "you've"));
  if (guestConflicts > 0) parts.push(eventsSentence(guestConflicts, "the taproom has"));
  if (utcCalendars > 0) parts.push("Your calendar is set to UTC.");
  if (parts.length === 0) {
    parts.push(
      openProblems === 1 ? "You have 1 open alert." : `You have ${openProblems} open alerts.`,
    );
  }
  return { openProblems, unreadMessages, bannerText: parts.join(" ") };
}

/** The menu count: open problems plus unread messages. */
export function notificationCount(
  summary: Pick<NotificationSummary, "openProblems" | "unreadMessages">,
): number {
  return summary.openProblems + summary.unreadMessages;
}

// The portal sections that have an /admin screen of their own.
const ADMIN_PATHS: Record<string, string> = {
  basics: "/admin/basics",
  "logo-cover": "/admin/media",
  events: "/admin/events",
  food: "/admin/food",
  links: "/admin/links",
  jobs: "/admin/jobs",
  discount: "/admin/discount",
  theme: "/admin/theme",
  notifications: "/admin/notifications",
};

/**
 * A registry button's link on this surface. The registry speaks in portal
 * paths; on /admin (Edit as them) they go to /admin's own screens, and a
 * section /admin doesn't have (People) stays in the portal.
 */
export function surfaceHref(to: string, surface: "portal" | "admin"): string {
  if (surface === "portal") return to;
  const match = /^\/portal\/([^/?#]+)(.*)$/.exec(to);
  const admin = match ? ADMIN_PATHS[match[1]] : undefined;
  return admin ? `${admin}${match![2]}` : to;
}
