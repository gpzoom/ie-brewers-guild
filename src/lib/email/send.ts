/**
 * The real Resend-calling implementation of every transactional email the
 * spec's "Transactional email" table describes (docs/member-profiles.md).
 * Every existing call site already wraps sendTransactionalEmail() in
 * try/catch and logs-and-continues on failure (creator-upload.server.ts,
 * hours-stale-cron.server.ts, invite-member.server.ts, and this phase's own
 * submit-contact-form.server.ts) -- that contract is unchanged from the
 * throwing stub this replaces. It still throws on a genuine send failure
 * (every recipient got a non-2xx Resend response, or a missing
 * RESEND_API_KEY), so those existing try/catch blocks keep doing something
 * meaningful. When only some of several recipients fail, it logs them and
 * returns them in `failed` instead (hours-stale-cron.server.ts uses this).
 *
 * It does NOT throw when a memberId-only trigger's target member has no
 * one to email yet (resolveRecipient returns [] for an unclaimed,
 * imported member -- spec, "Migrating the existing members") -- that's an
 * expected, non-error state, not a broken send, so it logs a notice and
 * returns instead of raising an alarm for something that isn't failing.
 *
 * A single fetch() call against Resend's HTTP API, not the `resend` npm
 * package -- one POST with a bearer token and a JSON body needs nothing an
 * SDK adds, matching every other borderline-dependency decision already
 * made in this build (see this plan's Decision 1).
 */
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getRequest } from "@tanstack/react-start/server";
import { buildEmailContent, ORG_SHORT_NAME, resolveEmailSiteUrl } from "@/lib/email/build-email-content";
import { resolveRecipient } from "@/lib/email/resolve-recipient.server";

export type { TransactionalEmailPayload } from "@/lib/email/build-email-content";
import type { TransactionalEmailPayload } from "@/lib/email/build-email-content";

const RESEND_API_URL = "https://api.resend.com/emails";

// mail.iscbrewersguild.org is already verified in Resend (SPF/DKIM/DMARC in
// place before the first send) -- spec, "Transactional email"; task brief's
// "Known facts." No further domain-verification work belongs in this file.
const TRANSACTIONAL_FROM_ADDRESS = `${ORG_SHORT_NAME} <notifications@mail.iscbrewersguild.org>`;

type EmailWorkerEnv = { RESEND_API_KEY?: string };

// Duplicated locally rather than exported from src/lib/supabase/server.ts's
// own getWorkerEnv, matching the convention the Guild Admin phase's
// impersonation module already established for the same reason: avoid
// widening an existing file's public API for one new env key.
async function getEmailWorkerEnv(): Promise<EmailWorkerEnv> {
  const { env } = await import("cloudflare:workers");
  return env as EmailWorkerEnv;
}

// The in-flight request's URL, so email links point back at the site that
// sent them (see resolveEmailSiteUrl). A cron run has no request, and
// getRequest() throws outside one -- null then means "use SITE_URL".
function currentRequestUrl(): string | null {
  try {
    return getRequest().url;
  } catch {
    return null;
  }
}

/** Which recipients were emailed and which failed (Guild emails go to the owner and every co-owner). */
export type SendResult = { sent: string[]; failed: string[] };

/**
 * One separate email per recipient. Throws when every recipient failed (so a
 * single-recipient send throws on failure, as before); when only some failed
 * it logs them and returns them in `failed`.
 */
export async function sendTransactionalEmail(payload: TransactionalEmailPayload): Promise<SendResult> {
  const supabase = await getSupabaseServiceRoleClient();
  const siteUrl = resolveEmailSiteUrl(currentRequestUrl());
  const recipients = await resolveRecipient(payload, supabase, siteUrl);

  if (recipients.length === 0) {
    const memberIdNote = "memberId" in payload ? ` (memberId: ${payload.memberId})` : "";
    console.warn(
      `sendTransactionalEmail: no recipient for trigger "${payload.trigger}"${memberIdNote} -- skipping, nothing sent.`,
    );
    return { sent: [], failed: [] };
  }

  const env = await getEmailWorkerEnv();
  if (!env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY in the Worker environment.");
  }

  const content = buildEmailContent(payload, siteUrl);

  // One separate email per recipient; a failure for one doesn't stop the rest.
  const sent: string[] = [];
  const failed: string[] = [];
  const failures: string[] = [];
  for (const to of recipients) {
    try {
      const response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: TRANSACTIONAL_FROM_ADDRESS,
          to: [to],
          subject: content.subject,
          html: content.html,
          text: content.text,
          ...(content.replyTo ? { reply_to: content.replyTo } : {}),
        }),
      });
      if (response.ok) {
        sent.push(to);
      } else {
        const responseBody = await response.text().catch(() => "");
        failed.push(to);
        failures.push(`${response.status} ${response.statusText}: ${responseBody}`);
      }
    } catch (error) {
      failed.push(to);
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (failed.length > 0) {
    const message = `Resend request failed for trigger "${payload.trigger}" (${failed.length} of ${recipients.length} recipients): ${failures.join("; ")}`;
    if (sent.length === 0) throw new Error(message);
    console.error(message);
  }
  return { sent, failed };
}

/** A prebuilt email to several addresses (Guild member visit emails). Throws on a Resend error. */
export async function sendRawEmail(p: { to: string[]; subject: string; html: string; text: string }): Promise<void> {
  const env = await getEmailWorkerEnv();
  if (!env.RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY in the Worker environment.");
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: TRANSACTIONAL_FROM_ADDRESS, to: p.to, subject: p.subject, html: p.html, text: p.text }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend request failed (${response.status} ${response.statusText}): ${body}`);
  }
}
