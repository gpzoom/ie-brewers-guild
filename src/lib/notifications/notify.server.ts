import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { rowFields, typeDef } from "./registry";

/**
 * Tells a member something happened (spec, "A general notifications
 * system"): stores one message row, unread, through insert_member_message
 * (which decides `quiet`). Kind, recipients, email mode and reminder come
 * from the type's registry entry, so a new message type needs only its
 * entry. The 15-minute sender emails it. Problems never come through here --
 * they open and resolve only through their check. Service role. Throws on
 * an unknown or problem type, or when the insert fails; a caller whose own
 * work must not fail because of it catches.
 */
export async function notify(
  memberId: string,
  type: string,
  details: Record<string, unknown>,
  opts: { dedupeKey?: string; eventId?: string; dueDate?: string } = {},
): Promise<void> {
  const def = typeDef(type);
  if (def.kind !== "message") {
    throw new Error(`notify() is for messages; ${type} is a problem type`);
  }
  const db = await getSupabaseServiceRoleClient();
  const { error } = await db.rpc("insert_member_message", {
    p_row: {
      type,
      member_id: memberId,
      details,
      dedupe_key: opts.dedupeKey ?? null,
      event_id: opts.eventId ?? null,
      due_date: opts.dueDate ?? null,
      ...rowFields(def),
    },
  });
  if (error) throw error;
}
