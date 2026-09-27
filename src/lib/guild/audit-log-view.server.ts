import { createServerFn } from "@tanstack/react-start";
import {
  getSupabaseServerClientForRequest,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { withSuperAdmin } from "@/lib/auth/super-admin";
import { describeAuditEntry } from "@/lib/guild/audit-log-view";

/**
 * The super admin's Audit log (docs/member-profiles.md, "Super admin"):
 * read-only, newest first, filterable by member, person and date. Rows are
 * read through the session client, where audit_log's select policy lets
 * only the super admin see them; people's addresses need the service key,
 * used only after the super admin check (withSuperAdmin).
 *
 * "[person], editing as [member]": a row about a member written by someone
 * who isn't linked to that member (a Guild admin or the super admin using
 * Edit as them). A member's own logged actions -- confirming their type --
 * read as theirs.
 */

export type AuditFilter = {
  memberId?: string;
  actorUserId?: string;
  /** YYYY-MM-DD, inclusive, in the Guild's time zone. */
  from?: string;
  to?: string;
};

export type AuditLogEntryView = {
  id: string;
  createdAt: string;
  actorUserId: string;
  actorEmail: string | null;
  memberId: string | null;
  memberName: string | null;
  editingAs: boolean;
  description: string;
};

export type AuditLogView = {
  entries: AuditLogEntryView[];
  /** Whether more rows matched than are shown. */
  truncated: boolean;
  members: Array<{ id: string; name: string }>;
  people: Array<{ userId: string; email: string | null }>;
};

const PAGE = 300;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

function cleanFilter(data: AuditFilter | undefined): AuditFilter {
  return {
    memberId: data?.memberId && UUID.test(data.memberId) ? data.memberId : undefined,
    actorUserId: data?.actorUserId && UUID.test(data.actorUserId) ? data.actorUserId : undefined,
    from: data?.from && DAY.test(data.from) ? data.from : undefined,
    to: data?.to && DAY.test(data.to) ? data.to : undefined,
  };
}

type Row = {
  id: string;
  created_at: string;
  actor_user_id: string;
  member_id: string | null;
  table_name: string;
  action: string;
  details: Record<string, unknown> | null;
};

export const getAuditLog = createServerFn({ method: "GET" })
  .inputValidator((data: AuditFilter) => cleanFilter(data))
  .handler(async ({ data }): Promise<AuditLogView> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { value: service } = await withSuperAdmin(supabase, "read the audit log", () =>
      getSupabaseServiceRoleClient(),
    );

    let query = supabase
      .from("audit_log")
      .select("id, created_at, actor_user_id, member_id, table_name, action, details")
      .order("created_at", { ascending: false })
      .limit(PAGE + 1);
    if (data.memberId) query = query.eq("member_id", data.memberId);
    if (data.actorUserId) query = query.eq("actor_user_id", data.actorUserId);
    // Whole days in the Guild's time zone (Pacific; -07:00 or -08:00 --
    // a day's edges are close enough either way for a filter).
    if (data.from) query = query.gte("created_at", `${data.from}T00:00:00-08:00`);
    if (data.to) query = query.lte("created_at", `${data.to}T23:59:59-07:00`);
    const { data: rowData, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (rowData ?? []) as Row[];
    const truncated = rows.length > PAGE;
    const shown = rows.slice(0, PAGE);

    const [{ data: memberRows }, { data: actorRows }] = await Promise.all([
      supabase.from("members").select("id, business_name").order("business_name"),
      supabase.from("audit_log").select("actor_user_id"),
    ]);
    const members = ((memberRows ?? []) as Array<{ id: string; business_name: string | null }>).map((m) => ({
      id: m.id,
      name: m.business_name?.trim() || "Unnamed business",
    }));
    const memberName = new Map(members.map((m) => [m.id, m.name]));

    const actorIds = [
      ...new Set(((actorRows ?? []) as Array<{ actor_user_id: string }>).map((r) => r.actor_user_id)),
    ];
    const emails = new Map<string, string | null>();
    await Promise.all(
      actorIds.map(async (id) => {
        const { data: user } = await service.auth.admin.getUserById(id);
        emails.set(id, user?.user?.email ?? null);
      }),
    );

    // Which (person, member) pairs are the member's own people.
    const { data: links } = await service
      .from("member_users")
      .select("member_id, user_id")
      .in("user_id", actorIds.length > 0 ? actorIds : ["00000000-0000-0000-0000-000000000000"]);
    const linked = new Set(
      ((links ?? []) as Array<{ member_id: string; user_id: string }>).map((l) => `${l.user_id}:${l.member_id}`),
    );

    return {
      entries: shown.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        actorUserId: row.actor_user_id,
        actorEmail: emails.get(row.actor_user_id) ?? null,
        memberId: row.member_id,
        memberName: row.member_id ? (memberName.get(row.member_id) ?? null) : null,
        editingAs: row.member_id !== null && !linked.has(`${row.actor_user_id}:${row.member_id}`),
        description: describeAuditEntry({
          tableName: row.table_name,
          action: row.action,
          details: row.details,
        }),
      })),
      truncated,
      members,
      people: actorIds
        .map((userId) => ({ userId, email: emails.get(userId) ?? null }))
        .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? "")),
    };
  });
