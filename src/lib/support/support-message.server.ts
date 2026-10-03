import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import {
  getSupabaseServerClientForRequest,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { requirePortalMember } from "@/lib/portal/portal-session.server";
import { requireMemberSession } from "@/lib/auth/require-member-session.server";
import { sendTransactionalEmail } from "@/lib/email/send";
import { DEFAULT_SUPPORT_INBOX_EMAIL } from "@/lib/email/build-email-content";
import { supportAreaForPath } from "@/lib/support/support-message";
import {
  sendSupportMessageCore,
  type SendSupportMessageResult,
  type SupportSender,
} from "@/lib/support/support-message-core";
import type { MemberType } from "@/lib/supabase/types";

/**
 * The Help button (docs/member-profiles.md, "Help button"), shown on every
 * screen of the member portal, the old /admin editor and the Guild screens.
 *
 * Who is sending and which profile they're on come from the session, the
 * same way each area works it out for itself (requirePortalMember for
 * /portal, requireMemberSession for /admin; the Guild screens have no
 * profile). The page only says which path it's on.
 */

const resolveSupportSender = createServerOnlyFn(
  async (pagePath: string): Promise<SupportSender | null> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return null;

    const area = supportAreaForPath(pagePath);
    let memberId: string | null = null;
    let isImpersonating = false;
    // Each area's own check throws a redirect when there's no single profile
    // to work on (signed out, several businesses to choose from, and so on);
    // the message is still sent, just without a profile.
    if (area === "portal") {
      try {
        const member = await requirePortalMember();
        memberId = member.memberId;
        isImpersonating = member.isImpersonating;
      } catch {
        /* no profile */
      }
    } else if (area === "admin") {
      try {
        const session = await requireMemberSession();
        memberId = session.memberId;
        isImpersonating = session.isImpersonating;
      } catch {
        /* no profile */
      }
    }

    let isGuildAdmin = isImpersonating;
    if (area === "guild") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_guild_admin")
        .eq("id", user.id)
        .maybeSingle();
      isGuildAdmin = profile?.is_guild_admin === true;
    }

    let member: SupportSender["member"] = null;
    if (memberId) {
      const service = await getSupabaseServiceRoleClient();
      const { data: row } = await service
        .from("members")
        .select("business_name, member_type")
        .eq("id", memberId)
        .maybeSingle();
      if (row) {
        member = {
          id: memberId,
          name: (row.business_name as string | null)?.trim() || "Unnamed business",
          type: row.member_type as MemberType,
        };
      }
    }

    return {
      userId: user.id,
      accountEmail: user.email ?? null,
      isGuildAdmin,
      isImpersonating,
      member,
    };
  },
);

export type SupportContext =
  | { signedIn: false }
  | {
      signedIn: true;
      /** The signed-in email, to fill in the form (a Guild admin editing as a member gets their own). */
      email: string | null;
      /** The profile this message will be about, shown on the form. */
      memberName: string | null;
    };

/** What the Help form fills in for them. Read when the form opens. */
export const getSupportContext = createServerFn({ method: "GET" })
  .inputValidator((data: { pagePath: string }) => ({
    pagePath: typeof data?.pagePath === "string" ? data.pagePath.slice(0, 300) : "",
  }))
  .handler(async ({ data }): Promise<SupportContext> => {
    const sender = await resolveSupportSender(data.pagePath);
    if (!sender) return { signedIn: false };
    return { signedIn: true, email: sender.accountEmail, memberName: sender.member?.name ?? null };
  });

export const sendSupportMessage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data)
  .handler(async ({ data }): Promise<SendSupportMessageResult> => {
    const pagePath =
      data && typeof (data as { pagePath?: unknown }).pagePath === "string"
        ? (data as { pagePath: string }).pagePath
        : "";
    const sender = await resolveSupportSender(pagePath);
    if (!sender) {
      return {
        ok: false,
        errors: {},
        formError: "You've been signed out. Sign in again, then send your message.",
      };
    }

    const service = await getSupabaseServiceRoleClient();
    const { env } = await import("cloudflare:workers");
    const inbox =
      (env as { SUPPORT_INBOX_EMAIL?: string }).SUPPORT_INBOX_EMAIL?.trim() ||
      DEFAULT_SUPPORT_INBOX_EMAIL;

    try {
      return await sendSupportMessageCore({
        raw: data,
        sender,
        inbox,
        userAgent: getRequestHeader("User-Agent") ?? null,
        now: new Date(),
        sendEmail: sendTransactionalEmail,
        store: {
          async countSince(userId, sinceIso) {
            const { count, error } = await service
              .from("support_messages")
              .select("id", { count: "exact", head: true })
              .eq("submitted_by_user_id", userId)
              .gte("created_at", sinceIso);
            if (error) throw new Error(error.message);
            return count ?? 0;
          },
          async insert(row) {
            const { error } = await service.from("support_messages").insert(row);
            if (error) throw new Error(error.message);
          },
        },
      });
    } catch (err) {
      console.error("sendSupportMessage failed", err);
      return { ok: false, errors: {}, formError: "Couldn't send your message — try again." };
    }
  });
