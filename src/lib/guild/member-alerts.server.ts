import { createServerFn } from "@tanstack/react-start";
import { requireGuildAdminSession } from "@/lib/guild/member-business";
import { NOTIFICATION_HISTORY_DAYS } from "@/lib/notifications/portal-view";
import "@/lib/notifications/registry";
import {
  shapeMemberAlerts,
  type MemberAlertItem,
  type MemberAlertRow,
} from "@/lib/guild/member-alerts";

const COLUMNS =
  "id, type, kind, status, quiet, member_id, event_id, details, created_at, resolved_at, read_at";

/**
 * Every member's alerts for the Guild: open problems, unread messages, and
 * resolved / read items from the last 30 days. Session client; RLS lets a
 * Guild admin read every row, members and events.
 */
export const getMemberAlerts = createServerFn({ method: "GET" }).handler(
  async (): Promise<MemberAlertItem[]> => {
    const supabase = await requireGuildAdminSession();
    const now = new Date();
    const since = new Date(now.getTime() - NOTIFICATION_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("member_notifications")
      .select(COLUMNS)
      .or(`status.in.(open,unread),resolved_at.gte.${since},read_at.gte.${since}`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as MemberAlertRow[];

    const memberIds = new Set<string>();
    const eventIds = new Set<string>();
    for (const row of rows) {
      memberIds.add(row.member_id);
      const d = row.details as { other_member_id?: unknown; event_id?: unknown } | null;
      if (typeof d?.other_member_id === "string") memberIds.add(d.other_member_id);
      if (row.event_id) eventIds.add(row.event_id);
      if (typeof d?.event_id === "string") eventIds.add(d.event_id);
    }
    const [members, events] = await Promise.all([
      memberIds.size > 0
        ? supabase.from("members").select("id, business_name, timezone").in("id", [...memberIds])
        : Promise.resolve({ data: [], error: null }),
      eventIds.size > 0
        ? supabase.from("events").select("id, title, venue_name").in("id", [...eventIds])
        : Promise.resolve({ data: [], error: null }),
    ]);
    const memberMap = new Map(
      (
        (members.data ?? []) as Array<{ id: string; business_name: string; timezone: string | null }>
      ).map((m) => [m.id, { name: m.business_name, timezone: m.timezone }] as const),
    );
    const eventMap = new Map<string, string>();
    for (const e of (events.data ?? []) as Array<{
      id: string;
      title: string | null;
      venue_name: string | null;
    }>) {
      const title = e.title ?? e.venue_name;
      if (title) eventMap.set(e.id, title);
    }
    return shapeMemberAlerts(rows, { members: memberMap, events: eventMap }, now);
  },
);
