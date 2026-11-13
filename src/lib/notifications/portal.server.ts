import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { requireMemberSession } from "@/lib/auth/require-member-session.server";
import { requirePortalMember } from "@/lib/portal/portal-session.server";
import { recordAuditLogIfImpersonating } from "@/lib/guild/audit-log.server";
import { loadHiddenEventIds } from "./hidden-events";
import {
  NOTIFICATION_HISTORY_DAYS,
  shapeNotifications,
  summarizeNotifications,
  type NotificationGroups,
  type NotificationListRow,
  type NotificationSummary,
} from "./portal-view";
import type { NoticeContext } from "./types";

/**
 * The Notifications area's server side, for the portal and for /admin (so
 * Guild "Edit as them" shows it too). Everything reads through the
 * signed-in session client: RLS gives a member's people only the rows meant
 * for their role (and a Guild admin every row), so the member id here only
 * narrows the list to the business being worked on. Names and event titles
 * come from tables the session can read; a missing one falls back to the
 * registry's plain wording.
 */

const DEFAULT_TZ = "America/Los_Angeles";
const LIST_COLUMNS = "id, type, kind, status, details, created_at, resolved_at, read_at";

type Surface = "portal" | "admin";

function validateSurface(data: { surface?: unknown } | undefined): { surface: Surface } {
  return { surface: data?.surface === "admin" ? "admin" : "portal" };
}

/** The business being worked on, worked out the way each surface's layout does it. */
async function viewerMemberId(surface: Surface): Promise<string> {
  if (surface === "admin") return (await requireMemberSession()).memberId;
  return (await requirePortalMember()).memberId;
}

/** The menu count and the banner. */
export async function loadNotificationSummary(
  supabase: SupabaseClient,
  memberId: string,
): Promise<NotificationSummary> {
  const { data, error } = await supabase
    .from("member_notifications")
    .select("type, kind, status, details")
    .eq("member_id", memberId)
    .in("status", ["open", "unread"]);
  if (error) {
    // A failed read must never block the portal; it just shows no count.
    console.error("loadNotificationSummary failed", error);
    return { openProblems: 0, unreadMessages: 0, bannerText: null };
  }
  return summarizeNotifications((data ?? []) as NotificationListRow[]);
}

export const getNotificationSummary = createServerFn({ method: "GET" })
  .inputValidator(validateSurface)
  .handler(async ({ data }): Promise<NotificationSummary> => {
    const memberId = await viewerMemberId(data.surface);
    const supabase = await getSupabaseServerClientForRequest();
    return loadNotificationSummary(supabase, memberId);
  });

/** The list screen: Open, Unread, then Resolved / Read from the last 30 days. */
export async function loadMemberNotifications(
  supabase: SupabaseClient,
  memberId: string,
  now = new Date(),
): Promise<{ memberId: string; groups: NotificationGroups }> {
  const since = new Date(
    now.getTime() - NOTIFICATION_HISTORY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabase
    .from("member_notifications")
    .select(LIST_COLUMNS)
    .eq("member_id", memberId)
    .or(`status.in.(open,unread),resolved_at.gte.${since},read_at.gte.${since}`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as NotificationListRow[];

  const otherIds = new Set<string>();
  const eventIds = new Set<string>();
  for (const row of rows) {
    const d = row.details as { other_member_id?: unknown; event_id?: unknown } | null;
    if (typeof d?.other_member_id === "string") otherIds.add(d.other_member_id);
    if (typeof d?.event_id === "string") eventIds.add(d.event_id);
  }

  // Published members and their events are public; the member's own row and
  // events are readable by their people. Anything else stays unnamed.
  const [members, events] = await Promise.all([
    supabase
      .from("members")
      .select("id, business_name, timezone")
      .in("id", [memberId, ...otherIds]),
    eventIds.size > 0
      ? supabase
          .from("events")
          .select("id, title, venue_name")
          .in("id", [...eventIds])
      : Promise.resolve({ data: [], error: null }),
  ]);
  const memberById = new Map(
    (
      (members.data ?? []) as Array<{ id: string; business_name: string; timezone: string | null }>
    ).map((m) => [m.id, m]),
  );
  const titleById = new Map(
    (
      (events.data ?? []) as Array<{ id: string; title: string | null; venue_name: string | null }>
    ).map((e) => [e.id, e.title ?? e.venue_name ?? null]),
  );
  const self = memberById.get(memberId);
  const ctxFor = (row: NotificationListRow): NoticeContext => {
    const d = row.details as { other_member_id?: unknown; event_id?: unknown } | null;
    const other =
      typeof d?.other_member_id === "string" ? memberById.get(d.other_member_id) : undefined;
    return {
      memberName: self?.business_name ?? "your business",
      otherMemberName: other?.business_name ?? null,
      eventTitle: typeof d?.event_id === "string" ? (titleById.get(d.event_id) ?? null) : null,
      timezone: self?.timezone || DEFAULT_TZ,
    };
  };
  return { memberId, groups: shapeNotifications(rows, now, ctxFor) };
}

export const listMemberNotifications = createServerFn({ method: "GET" })
  .inputValidator(validateSurface)
  .handler(async ({ data }) => {
    const memberId = await viewerMemberId(data.surface);
    const supabase = await getSupabaseServerClientForRequest();
    return loadMemberNotifications(supabase, memberId);
  });

/**
 * Marks a message read (messages only; the SQL function refuses problems
 * and anyone the row isn't meant for). Read state is per member: anyone on
 * the team reading it marks it read.
 */
export const markNotificationRead = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (typeof data?.id !== "string" || data.id.length === 0 || data.id.length > 64) {
      throw new Error("Unknown notification.");
    }
    return { id: data.id };
  })
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    // RLS: only a row this person may read comes back.
    const { data: row, error: readError } = await supabase
      .from("member_notifications")
      .select("member_id")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!row) throw new Error("Unknown notification.");
    const { error } = await supabase.rpc("mark_member_notification_read", { p_id: data.id });
    if (error) throw new Error(error.message);
    await recordAuditLogIfImpersonating({
      memberId: (row as { member_id: string }).member_id,
      tableName: "member_notifications",
      rowId: data.id,
      action: "update",
    });
    return { ok: true as const };
  });

/** Which of these events are hidden from the public by an open closed-day conflict. */
export async function loadConflictEventIds(
  supabase: SupabaseClient,
  eventIds: readonly string[],
): Promise<string[]> {
  return [...(await loadHiddenEventIds(supabase, [...eventIds]))];
}

/** The Events editor's "Closed day" pills: the member's own events with an open conflict. */
export const conflictEventIds = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }): Promise<string[]> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: events, error } = await supabase
      .from("events")
      .select("id")
      .eq("member_id", data.memberId)
      .eq("kind", "event");
    if (error) {
      console.error("conflictEventIds failed", error);
      return [];
    }
    return loadConflictEventIds(
      supabase,
      ((events ?? []) as Array<{ id: string }>).map((e) => e.id),
    );
  });
