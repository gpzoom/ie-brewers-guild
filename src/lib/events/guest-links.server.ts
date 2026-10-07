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

    const { upserts, deletes } = decideGuestLinks({ ...inputs, now });
    if (upserts.length) {
      const { error } = await db
        .from("event_hosts")
        .upsert(
          upserts.map((u) => ({ ...u, status_set_by_user_id: null, updated_at: now.toISOString() })),
          { onConflict: "event_id" },
        );
      if (error) throw error;
    }
    if (deletes.length) {
      const { error } = await db.from("event_hosts").delete().in("event_id", deletes);
      if (error) throw error;
    }
  } catch (err) {
    console.error("relinkGuestStops failed", err);
  }
}
