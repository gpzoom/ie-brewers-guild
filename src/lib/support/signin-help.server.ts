import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendTransactionalEmail } from "@/lib/email/send";
import { SIGNIN_HELP_INBOX_EMAIL } from "@/lib/support/signin-help";
import { sendSignInHelpCore, type SendSignInHelpResult } from "@/lib/support/signin-help-core";

/**
 * Sign-in help (docs/member-profiles.md, "Sign-in help"): /signin/help's
 * send. Public by design -- the person can't sign in -- so, like the
 * Contact page's submitContactForm, the per-IP rate limit here is the
 * abuse guard and runs first, and a missing limiter refuses the request
 * rather than letting everything through. The honeypot, validation, the
 * saved Help messages row and the email are in signin-help-core.ts.
 */
export const sendSignInHelp = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data)
  .handler(async ({ data }): Promise<SendSignInHelpResult> => {
    const { env } = await import("cloudflare:workers");
    const rateLimiter = (
      env as { CREATOR_UPLOAD_RATE_LIMITER?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> } }
    ).CREATOR_UPLOAD_RATE_LIMITER;
    if (!rateLimiter) {
      console.error("sendSignInHelp: CREATOR_UPLOAD_RATE_LIMITER binding is missing -- refusing the request.");
      return { ok: false, errors: {}, formError: "Something went wrong. Try again in a moment." };
    }
    const clientIp = getRequestHeader("CF-Connecting-IP") ?? "unknown";
    const { success } = await rateLimiter.limit({ key: `signin-help:${clientIp}` });
    if (!success) {
      return { ok: false, errors: {}, formError: "Too many requests. Try again in a minute." };
    }

    const service = await getSupabaseServiceRoleClient();
    try {
      return await sendSignInHelpCore({
        raw: data,
        inbox: SIGNIN_HELP_INBOX_EMAIL,
        userAgent: getRequestHeader("User-Agent") ?? null,
        sendEmail: sendTransactionalEmail,
        async insert(row) {
          const { error } = await service.from("support_messages").insert(row);
          if (error) throw new Error(error.message);
        },
      });
    } catch (err) {
      console.error("sendSignInHelp failed", err);
      return { ok: false, errors: {}, formError: "Couldn't send your request. Try again in a moment." };
    }
  });
