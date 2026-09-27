import type { MemberType } from "@/lib/supabase/types";
import type { TransactionalEmailPayload } from "@/lib/email/build-email-content";
import {
  SUPPORT_MESSAGES_PER_HOUR,
  validateSupportMessage,
  type SupportFieldErrors,
  type SupportMessageInput,
} from "@/lib/support/support-message";

/**
 * The Help button's send (docs/member-profiles.md, "Help button"), with
 * the database and the mailer passed in so it can be tested without either.
 * support-message.server.ts works out the sender from the session and
 * calls this.
 */

/** Who is sending, worked out from the session -- never from the page. */
export type SupportSender = {
  userId: string;
  accountEmail: string | null;
  /** A Guild admin: on the Guild screens, or editing as a member. */
  isGuildAdmin: boolean;
  isImpersonating: boolean;
  member: { id: string; name: string; type: MemberType } | null;
};

export type SupportMessageRow = {
  kind: SupportMessageInput["kind"];
  first_name: string;
  email: string;
  message: string;
  member_id: string | null;
  member_name: string | null;
  submitted_by_user_id: string;
  sent_by_guild_admin: boolean;
  page_path: string | null;
  user_agent: string | null;
};

export type SupportMessageStore = {
  countSince(userId: string, sinceIso: string): Promise<number>;
  insert(row: SupportMessageRow): Promise<void>;
};

export type SendSupportMessageResult =
  | { ok: true }
  | { ok: false; errors: SupportFieldErrors; formError?: string };

export async function sendSupportMessageCore(deps: {
  raw: unknown;
  sender: SupportSender;
  store: SupportMessageStore;
  sendEmail: (payload: TransactionalEmailPayload) => Promise<void>;
  inbox: string;
  userAgent: string | null;
  now: Date;
}): Promise<SendSupportMessageResult> {
  const checked = validateSupportMessage(deps.raw as Parameters<typeof validateSupportMessage>[0]);
  if (!checked.ok) return { ok: false, errors: checked.errors };
  const input = checked.value;
  const { sender } = deps;

  const hourAgo = new Date(deps.now.getTime() - 60 * 60 * 1000).toISOString();
  if ((await deps.store.countSince(sender.userId, hourAgo)) >= SUPPORT_MESSAGES_PER_HOUR) {
    return {
      ok: false,
      errors: {},
      formError: "You've sent several messages in the last hour. Please try again a little later.",
    };
  }

  const userAgent = deps.userAgent ? deps.userAgent.slice(0, 500) : null;
  // Saved first: if the email fails, the message is still here.
  await deps.store.insert({
    kind: input.kind,
    first_name: input.firstName,
    email: input.email,
    message: input.message,
    member_id: sender.member?.id ?? null,
    member_name: sender.member?.name ?? null,
    submitted_by_user_id: sender.userId,
    sent_by_guild_admin: sender.isGuildAdmin,
    page_path: input.pagePath || null,
    user_agent: userAgent,
  });

  try {
    await deps.sendEmail({
      trigger: "support_message",
      to: deps.inbox,
      kind: input.kind,
      firstName: input.firstName,
      email: input.email,
      message: input.message,
      memberName: sender.member?.name ?? null,
      memberType: sender.member?.type ?? null,
      accountEmail: sender.accountEmail,
      senderRole: !sender.isGuildAdmin
        ? "member"
        : sender.isImpersonating
          ? "guild_admin_as_member"
          : "guild_admin",
      pagePath: input.pagePath,
      userAgent,
    });
  } catch (err) {
    // The message is saved; a failed email mustn't tell them it wasn't sent.
    console.error("sendSupportMessage: couldn't email the support inbox", err);
  }

  return { ok: true };
}
