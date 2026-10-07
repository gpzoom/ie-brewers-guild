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

    const { upserts, deletes, notices } = decideGuestLinks({ ...inputs, now });
    if (upserts.length) {
      const { error } = await db
        .from("event_hosts")
        .upsert(
          upserts.map((u) => ({ ...u, updated_at: now.toISOString() })),
          { onConflict: "event_id" },
        );
      if (error) throw error;
    }
    if (deletes.length) {
      const { error } = await db.from("event_hosts").delete().in("event_id", deletes);
      if (error) throw error;
    }
    // Part 2: what the taproom should hear about; the 15-minute job sends it
    // (guest-stop-notices.server.ts). A link that disappears leaves its own
    // note through the event_hosts delete trigger.
    if (notices.length) {
      const { error } = await db.from("guest_stop_notices").insert(notices);
      if (error) throw error;
    }
  } catch (err) {
    console.error("relinkGuestStops failed", err);
  }
}
