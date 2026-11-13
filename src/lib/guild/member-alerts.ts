import type { MemberNotificationRow } from "@/lib/supabase/types";
import { typeDef } from "@/lib/notifications/registry";
import { NOTIFICATION_HISTORY_DAYS } from "@/lib/notifications/portal-view";
import type { NoticeContext } from "@/lib/notifications/types";

/**
 * The Guild's Member alerts page as pure logic (spec 2026-11-13, "The
 * Guild"). The server file reads rows and names; this decides what each row
 * shows.
 */

export const ALERT_EDIT_PATH = "/admin/notifications";
export const LAUNCH_LABEL = "Found at launch, not emailed";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TZ = "America/Los_Angeles";

export type MemberAlertRow = Pick<
  MemberNotificationRow,
  | "id"
  | "type"
  | "kind"
  | "status"
  | "quiet"
  | "member_id"
  | "event_id"
  | "details"
  | "created_at"
  | "resolved_at"
  | "read_at"
>;

export type MemberAlertNames = {
  members: ReadonlyMap<string, { name: string; timezone: string | null }>;
  events: ReadonlyMap<string, string>;
};

export type MemberAlertItem = {
  id: string;
  status: MemberNotificationRow["status"];
  kind: MemberNotificationRow["kind"];
  memberId: string;
  memberName: string;
  otherMemberName: string | null;
  eventTitle: string | null;
  typeLabel: string;
  /** The date shown: found (open, unread) or resolved / read (history). */
  date: string;
  /** "open 3 days", "resolved 2 days ago". */
  age: string;
  /** Set for a row found while emails were off. */
  launchLabel: string | null;
  /** True for resolved / read rows (shown faded). */
  history: boolean;
  /** "Edit as them" target. */
  editMemberId: string;
  editPath: string;
};

function plural(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}

function isHistory(row: Pick<MemberAlertRow, "status">): boolean {
  return row.status === "resolved" || row.status === "read";
}

function dateOf(row: MemberAlertRow): string {
  if (!isHistory(row)) return row.created_at;
  return row.resolved_at ?? row.read_at ?? row.created_at;
}

export function ageText(row: MemberAlertRow, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - Date.parse(dateOf(row))) / DAY_MS));
  if (row.status === "open" || row.status === "unread") {
    const word = row.status;
    return days === 0 ? `${word} today` : `${word} ${plural(days)}`;
  }
  const word = row.status;
  return days === 0 ? `${word} today` : `${word} ${plural(days)} ago`;
}

/** Rows the Guild sees, shaped for the table, newest first. */
export function shapeMemberAlerts(
  rows: readonly MemberAlertRow[],
  names: MemberAlertNames,
  now: Date,
): MemberAlertItem[] {
  const cutoff = now.getTime() - NOTIFICATION_HISTORY_DAYS * DAY_MS;
  const items: MemberAlertItem[] = [];
  for (const row of rows) {
    let def;
    try {
      def = typeDef(row.type);
    } catch {
      continue; // an unregistered type has no wording to show
    }
    if (!def.guildSees) continue;
    const date = dateOf(row);
    if (isHistory(row) && Date.parse(date) < cutoff) continue;

    const d = row.details as { other_member_id?: unknown; event_id?: unknown } | null;
    const self = names.members.get(row.member_id);
    const otherId = typeof d?.other_member_id === "string" ? d.other_member_id : null;
    const eventId = row.event_id ?? (typeof d?.event_id === "string" ? d.event_id : null);
    const ctx: NoticeContext = {
      memberName: self?.name ?? "this member",
      otherMemberName: otherId ? (names.members.get(otherId)?.name ?? null) : null,
      eventTitle: eventId ? (names.events.get(eventId) ?? null) : null,
      timezone: self?.timezone || DEFAULT_TZ,
    };
    let typeLabel: string;
    try {
      typeLabel = def.portal(row.details, ctx).title;
    } catch {
      typeLabel = row.type;
    }
    items.push({
      id: row.id,
      status: row.status,
      kind: row.kind,
      memberId: row.member_id,
      memberName: self?.name ?? "Unknown member",
      otherMemberName: ctx.otherMemberName,
      eventTitle: ctx.eventTitle,
      typeLabel,
      date,
      age: ageText(row, now),
      launchLabel: row.quiet ? LAUNCH_LABEL : null,
      history: isHistory(row),
      editMemberId: row.member_id,
      editPath: ALERT_EDIT_PATH,
    });
  }
  return items.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}
