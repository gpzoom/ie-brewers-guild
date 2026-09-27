import type { SupabaseClient } from "@supabase/supabase-js";
import { isCalendarSyncDue } from "@/lib/guild/site-settings";

/**
 * Whether this cron tick should re-sync every calendar, and if so, claims
 * the run (docs/member-profiles.md, "Super admin" > "Settings").
 *
 * Reads the super admin's interval, checks it's due (isCalendarSyncDue),
 * then records this run with a conditional update -- only if the last run
 * is still the one just read. Staging and production share the database
 * and both fire on the same tick, so exactly one of them gets the row back
 * and syncs; the other sees zero rows and stops. `supabase` is the
 * service-role client (the cron has no session).
 */
export async function claimScheduledCalendarSync(
  supabase: SupabaseClient,
  now: Date,
): Promise<boolean> {
  const { data: settings, error } = await supabase
    .from("site_settings")
    .select("calendar_sync_interval_minutes, calendar_sync_last_run_at")
    .eq("id", true)
    .maybeSingle();
  if (error) {
    console.error("calendar sync: couldn't read site_settings", error);
    return false;
  }

  const interval = (settings?.calendar_sync_interval_minutes as number | undefined) ?? 15;
  const lastRunAt = (settings?.calendar_sync_last_run_at as string | null | undefined) ?? null;
  if (!isCalendarSyncDue(interval, lastRunAt, now)) return false;

  let claim = supabase
    .from("site_settings")
    .update({ calendar_sync_last_run_at: now.toISOString() })
    .eq("id", true);
  claim =
    lastRunAt === null
      ? claim.is("calendar_sync_last_run_at", null)
      : claim.eq("calendar_sync_last_run_at", lastRunAt);
  const { data: claimed, error: claimError } = await claim.select("id");
  if (claimError) {
    console.error("calendar sync: couldn't record the run", claimError);
    return false;
  }
  return (claimed ?? []).length > 0;
}
