import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { readImpersonationState, touchImpersonationActivity } from "@/lib/guild/impersonation.server";
import { shouldRecordAudit } from "@/lib/guild/impersonation-token";

export type AuditableAction = "insert" | "update" | "delete";

/**
 * The one shared wrapper every member-scoped mutation file calls right
 * after its own write succeeds (this plan's Decisions 1-2 explain why this
 * approach, not a Postgres session-variable trigger, is the reliable one
 * over Supabase's REST API). A no-op when there's no active impersonation
 * targeting this exact memberId AND the real signed-in user isn't a Guild
 * admin either -- an ordinary member editing their own profile never
 * writes to audit_log at all.
 *
 * Also refreshes the idle timer (touchImpersonationActivity) on every
 * logged write via the impersonation-cookie branch, so actively editing
 * never triggers the 30-minute idle timeout mid-session.
 */
export async function recordAuditLogIfImpersonating(params: {
  memberId: string;
  tableName: string;
  rowId: string | null;
  action: AuditableAction;
}): Promise<void> {
  const state = await readImpersonationState();
  const supabase = await getSupabaseServerClientForRequest();

  if (shouldRecordAudit(state, params.memberId)) {
    const { error } = await supabase.from("audit_log").insert({
      actor_user_id: state!.actorUserId,
      member_id: params.memberId,
      table_name: params.tableName,
      row_id: params.rowId,
      action: params.action,
    });
    if (error) {
      // The real write already succeeded by the time this runs -- a logging
      // failure must never look like the edit itself failed.
      console.error("recordAuditLogIfImpersonating: failed to write audit_log row", error);
    }
    await touchImpersonationActivity(state!);
    return;
  }

  // No matching impersonation cookie -- but the write may still have gone
  // through, because RLS also lets a Guild admin write to any member's row
  // directly (the same grant an active impersonation session itself relies
  // on). That happens when the cookie expired mid-session, or was replaced
  // by starting a different impersonation in another tab, while this
  // write's page was still loaded against the old target. Detect that case
  // and log it too, attributed to the real signed-in user -- otherwise a
  // real write would go completely unaudited, silently breaking the
  // "every write is logged against the real actor" promise the
  // impersonation banner displays. An ordinary member editing their own
  // profile (never a Guild admin) still falls through this check to a
  // clean no-op, as before.
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_guild_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_guild_admin) return;

  const { error } = await supabase.from("audit_log").insert({
    actor_user_id: user.id,
    member_id: params.memberId,
    table_name: params.tableName,
    row_id: params.rowId,
    action: params.action,
  });
  if (error) {
    console.error(
      "recordAuditLogIfImpersonating: failed to write audit_log row (guild-admin-without-active-cookie path)",
      error,
    );
  }
}

export type PeopleAuditKind = "invite" | "resend" | "cancel" | "remove" | "change_access" | "leave";

export type PeopleAuditDetails = {
  kind: PeopleAuditKind;
  email: string | null;
  role?: string;
  fromRole?: string;
  toRole?: string;
};

/**
 * Logs one People change (invite, resend, cancel, remove, change access,
 * leave), whoever makes it. Uses the service-role client because non-admins
 * can't insert into audit_log through RLS. Like the wrapper above, a logging
 * failure is reported but never thrown, so it can't undo the People change.
 * `rowId` must be a uuid or null. `impersonating` (a Guild admin using Edit
 * as them) is stored in `details`, so the Audit log can tell a Guild admin's
 * change from the member's own people's -- even after a co-owner leaves.
 */
export async function recordPeopleAudit(params: {
  actorUserId: string;
  memberId: string;
  tableName: "member_invites" | "member_users";
  rowId: string | null;
  action: AuditableAction;
  details: PeopleAuditDetails;
  impersonating: boolean;
}): Promise<void> {
  try {
    const admin = await getSupabaseServiceRoleClient();
    const { error } = await admin.from("audit_log").insert({
      actor_user_id: params.actorUserId,
      member_id: params.memberId,
      table_name: params.tableName,
      row_id: params.rowId,
      action: params.action,
      details: { ...params.details, impersonating: params.impersonating },
    });
    if (error) console.error("recordPeopleAudit: failed to write audit_log row", error);
  } catch (err) {
    console.error("recordPeopleAudit: failed to write audit_log row", err);
  }
}
