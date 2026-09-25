/**
 * The real Resend-calling implementation of every transactional email the
 * spec's "Transactional email" table describes (docs/member-profiles.md).
 * Every existing call site already wraps sendTransactionalEmail() in
 * try/catch and logs-and-continues on failure (creator-upload.server.ts,
 * hours-stale-cron.server.ts, invite-member.server.ts, and this phase's own
 * submit-contact-form.server.ts) -- that contract is unchanged from the
 * throwing stub this replaces. It still throws on a genuine send failure
 * (a non-2xx Resend response, or a missing RESEND_API_KEY), so those
 * existing try/catch blocks keep doing something meaningful.
 *
 * It does NOT throw when a memberId-only trigger's target member has no
 * one to email yet (resolveRecipient returns null for an unclaimed,
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

export async function sendTransactionalEmail(payload: TransactionalEmailPayload): Promise<void> {
  const supabase = await getSupabaseServiceRoleClient();
  const siteUrl = resolveEmailSiteUrl(currentRequestUrl());
  const to = await resolveRecipient(payload, supabase, siteUrl);

  if (!to) {
    const memberIdNote = "memberId" in payload ? ` (memberId: ${payload.memberId})` : "";
    console.warn(
      `sendTransactionalEmail: no recipient for trigger "${payload.trigger}"${memberIdNote} -- skipping, nothing sent.`,
    );
    return;
  }

  const env = await getEmailWorkerEnv();
  if (!env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY in the Worker environment.");
  }

  const content = buildEmailContent(payload, siteUrl);

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
    }),
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    throw new Error(
      `Resend request failed for trigger "${payload.trigger}" (${response.status} ${response.statusText}): ${responseBody}`,
    );
  }
}
