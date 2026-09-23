/**
 * The Resend-calling implementation for every transactional email lives in
 * the Contact Form + Resend phase — the very next phase in this build
 * sequence. This file only defines the payload shape and the call sites
 * this phase is responsible for firing (this plan's Decisions 17–18):
 * "Creator uploads to a gallery -> the member" and "Hours stale past 90
 * days -> the member." The other three of the spec's five triggers belong
 * to Guild Admin ("Member invited") or the Contact Form phase (both
 * "Contact form submitted" rows) and are not called from anywhere in this
 * plan.
 *
 * This throws deliberately, rather than silently succeeding as a no-op --
 * a no-op would look like working code and isn't. Every call site in this
 * plan wraps the call in try/catch and logs-and-continues, so an upload or
 * a stale-hours cron run still succeeds today even though the email itself
 * doesn't yet.
 */
export type TransactionalEmailPayload =
  | { trigger: "creator_upload_pending"; memberId: string; assetId: string; creatorName: string | null }
  | { trigger: "hours_stale"; memberId: string; confirmUrl: string };

export async function sendTransactionalEmail(payload: TransactionalEmailPayload): Promise<void> {
  throw new Error(
    `sendTransactionalEmail() is not implemented yet (trigger: "${payload.trigger}"). ` +
      "Wire this up in the Contact Form + Resend phase — see docs/member-profiles.md, 'Transactional email'.",
  );
}
