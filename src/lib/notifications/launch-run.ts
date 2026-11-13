import type { MemberNotificationRow } from "@/lib/supabase/types";

/** Runs the launch summary step only when the problem check completed. */
export async function runLaunchSummaryIf(
  refreshed: boolean,
  run: () => Promise<void>,
): Promise<void> {
  if (refreshed) await run();
  else console.warn("launch summary skipped: the member problem check did not complete");
}

export type LaunchRunDeps = {
  /** The settings row; null if missing. */
  loadSettings(): Promise<{ emails_enabled: boolean; launch_summary_sent_at: string | null } | null>;
  loadQuietOpen(): Promise<MemberNotificationRow[]>;
  /** Conditionally sets launch_summary_sent_at (still null, emails still off); true if this run got it. */
  claim(): Promise<boolean>;
  /** Puts launch_summary_sent_at back to null. */
  release(): Promise<void>;
  /** Looks up recipients and sends; throws on failure. */
  send(rows: MemberNotificationRow[]): Promise<void>;
};

/**
 * The launch summary's rules (the database and mail are passed in):
 * - nothing to do once sent, or once member emails are on;
 * - no quiet open problems yet: claim nothing (it re-checks every run);
 * - claim first (atomic), so overlapping runs can't both send; a failed
 *   send gives the claim back so the next run retries. Tradeoff, accepted:
 *   a Worker that dies between the claim and the send leaves it marked sent.
 */
export async function runLaunchSummary(d: LaunchRunDeps): Promise<void> {
  const s = await d.loadSettings();
  if (!s || s.emails_enabled || s.launch_summary_sent_at) return;
  const rows = await d.loadQuietOpen();
  if (rows.length === 0) return;
  if (!(await d.claim())) return;
  try {
    await d.send(rows);
  } catch (err) {
    await d.release();
    throw err;
  }
}
