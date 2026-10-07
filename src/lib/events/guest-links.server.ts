import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { decideGuestLinks } from "@/lib/events/guest-links";
import { loadLinkerInputs } from "@/lib/events/guest-links-load";

/**
 * Relinks Mobile members' upcoming stops to the Guild taprooms they're at
 * (guest-links.ts decides). Service role: links are written only here.
 * Never throws -- a save or sync that succeeded must not fail because of it.
 */
export async function relinkGuestStops(scope: { memberId?: string } = {}): Promise<void> {
  try {
    const db = await getSupabaseServiceRoleClient();
    const now = new Date();
    const inputs = await loadLinkerInputs(db, scope, now);
    if (!inputs) return;

    const { writes, deletes } = decideGuestLinks({ ...inputs, now });
    if (writes.length === 0 && deletes.length === 0) return;
    // Each write applies only if the link is still as read, with its email
    // notes queued in the same step (apply_guest_links); a link that
    // disappears leaves its own note through the event_hosts delete trigger.
    // The 15-minute job sends them (guest-stop-notices.server.ts).
    const { error } = await db.rpc("apply_guest_links", { p_writes: writes, p_deletes: deletes });
    if (error) throw error;
  } catch (err) {
    console.error("relinkGuestStops failed", err);
  }
}
