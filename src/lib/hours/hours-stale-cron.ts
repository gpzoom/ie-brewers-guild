/**
 * Pure staleness-episode comparison logic for the daily hours-stale cron
 * (hours-stale-cron.server.ts), split out into its own `.ts` file so it's
 * unit-testable without a Supabase client or the Worker `env` -- same
 * pure-logic/.ts vs. I/O/.server.ts split this project already uses for
 * confirm-token.ts vs. confirm-token.server.ts (Task 28).
 *
 * Sends exactly one notice per staleness episode (this plan's Decision 15):
 * a member is "already notified for the current episode" only if a notice
 * was sent at or after their most recent hours confirmation. Notified
 * BEFORE the current confirmation doesn't count -- re-confirming hours
 * naturally re-arms the next notice 90 days later, without anything needing
 * to explicitly clear hours_stale_notice_sent_at first. Never notified
 * before (null) is "not yet notified," matching the "should notify" default
 * for a member with no prior notice record at all.
 *
 * Boundary decision: an exact tie (hours_stale_notice_sent_at ===
 * hours_confirmed_at, to the millisecond) is treated as "already notified"
 * (>=), not "notify again" -- the more conservative, don't-double-send
 * reading. In practice the only way to observe this boundary at all is two
 * ISO timestamps produced by separate `new Date().toISOString()` calls
 * landing on the exact same millisecond, which is vanishingly unlikely, but
 * the choice is deliberate rather than an accident of `>` vs. `>=`.
 */
export function hasAlreadyBeenNotifiedForCurrentStalenessEpisode(
  hoursStaleNoticeSentAt: string | null,
  hoursConfirmedAt: string | null,
): boolean {
  if (!hoursStaleNoticeSentAt || !hoursConfirmedAt) return false;
  return new Date(hoursStaleNoticeSentAt) >= new Date(hoursConfirmedAt);
}
