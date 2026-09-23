import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { readImpersonationState, touchImpersonationActivity } from "@/lib/guild/impersonation.server";
import { shouldRecordAudit } from "@/lib/guild/impersonation-token";

export type AuditableAction = "insert" | "update" | "delete";

/**
 * The one shared wrapper every member-scoped mutation file calls right
 * after its own write succeeds (this plan's Decisions 1-2 explain why this
 * approach, not a Postgres session-variable trigger, is the reliable one
 * over Supabase's REST API). A no-op when there's no active impersonation
 * targeting this exact memberId -- an ordinary member editing their own
 * profile never writes to audit_log at all, matching the spec's own
 * framing of this rule as specifically about impersonation sessions
 * ("every write is logged against the real actor" appears under "Editing
 * as a member," not as a blanket audit-everything requirement).
 *
 * Also refreshes the idle timer (touchImpersonationActivity) on every
 * logged write, so actively editing never triggers the 30-minute idle
 * timeout mid-session.
 */
export async function recordAuditLogIfImpersonating(params: {
  memberId: string;
  tableName: string;
  rowId: string | null;
  action: AuditableAction;
}): Promise<void> {
  const state = await readImpersonationState();
  if (!shouldRecordAudit(state, params.memberId)) return;

  const supabase = await getSupabaseServerClientForRequest();
  const { error } = await supabase.from("audit_log").insert({
    actor_user_id: state!.actorUserId,
    member_id: params.memberId,
    table_name: params.tableName,
    row_id: params.rowId,
    action: params.action,
  });
  if (error) {
    // The real write already succeeded by the time this runs -- a logging
    // failure must never look like the edit itself failed. Surfaced loudly
    // via console.error so it shows in Worker logs/tail, matching this
    // codebase's existing log-and-continue pattern for
    // sendTransactionalEmail failures (Member Admin phase, Task 19-20).
    console.error("recordAuditLogIfImpersonating: failed to write audit_log row", error);
  }

  await touchImpersonationActivity(state!);
}
