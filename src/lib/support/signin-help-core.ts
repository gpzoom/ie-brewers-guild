import type { TransactionalEmailPayload } from "@/lib/email/build-email-content";
import {
  SIGNIN_HELP_NO_NOTE,
  validateSignInHelp,
  type SignInHelpFieldErrors,
} from "@/lib/support/signin-help";

/**
 * Sign-in help's send (docs/member-profiles.md, "Sign-in help"), with the
 * database and the mailer passed in so it can be tested without either.
 * signin-help.server.ts applies the per-IP rate limit first and calls this.
 */

/** The support_messages row a request becomes (see the 2026-10-19 migration). */
export type SignInHelpRow = {
  kind: "signin";
  first_name: string;
  email: string;
  previous_email: string;
  member_name: string;
  message: string;
  submitted_by_user_id: null;
  sent_by_guild_admin: false;
  page_path: string;
  user_agent: string | null;
};

export type SendSignInHelpResult =
  | { ok: true }
  | { ok: false; errors: SignInHelpFieldErrors; formError?: string };

export const SIGNIN_HELP_PAGE_PATH = "/signin/help";

export async function sendSignInHelpCore(deps: {
  raw: unknown;
  insert: (row: SignInHelpRow) => Promise<void>;
  sendEmail: (payload: TransactionalEmailPayload) => Promise<void>;
  inbox: string;
  userAgent: string | null;
}): Promise<SendSignInHelpResult> {
  const raw = (deps.raw ?? {}) as Record<string, unknown>;
  // A filled honeypot gets the same answer as a real request, with nothing
  // saved or sent, so a bot can't tell it was caught (as on the Contact page).
  if (typeof raw.honeypot === "string" && raw.honeypot.trim() !== "") return { ok: true };

  const checked = validateSignInHelp(raw);
  if (!checked.ok) return { ok: false, errors: checked.errors };
  const input = checked.value;
  const userAgent = deps.userAgent ? deps.userAgent.slice(0, 500) : null;

  // Saved first: if the email fails, the request is still on Help messages.
  await deps.insert({
    kind: "signin",
    first_name: input.name,
    email: input.newEmail,
    previous_email: input.previousEmail,
    member_name: input.businessName,
    message: input.note || SIGNIN_HELP_NO_NOTE,
    submitted_by_user_id: null,
    sent_by_guild_admin: false,
    page_path: SIGNIN_HELP_PAGE_PATH,
    user_agent: userAgent,
  });

  try {
    await deps.sendEmail({
      trigger: "signin_help",
      to: deps.inbox,
      name: input.name,
      businessName: input.businessName,
      previousEmail: input.previousEmail,
      newEmail: input.newEmail,
      note: input.note,
      userAgent,
    });
  } catch (err) {
    // The request is saved; a failed email mustn't tell them it wasn't sent.
    console.error("sendSignInHelp: couldn't email the support inbox", err);
  }

  return { ok: true };
}
