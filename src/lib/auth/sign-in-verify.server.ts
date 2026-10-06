import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { afterSignInHref } from "@/lib/auth/after-sign-in.server";
import { OTP_TYPES, normalizeEmailCode, type EmailOtpType } from "@/lib/auth/sign-in-link";

type Result = { ok: true; href: string } | { ok: false; message: string };

const LINK_FAILED = "That sign-in link has already been used or has expired. Request a new one below, or use the code from the email.";
const CODE_FAILED = "That code didn't work. Check it against the newest email, or send a new one.";

/**
 * The Confirm sign-in button (/auth/confirm): verifies the emailed link's
 * token hash. Works in any browser or device -- unlike the old link, it
 * doesn't need the browser that asked for it.
 */
export const confirmEmailLink = createServerFn({ method: "POST" })
  .inputValidator((data: { tokenHash: string; type: string; next?: string }) => data)
  .handler(async ({ data }): Promise<Result> => {
    const type: EmailOtpType = (OTP_TYPES as readonly string[]).includes(data.type) ? (data.type as EmailOtpType) : "email";
    const tokenHash = (data.tokenHash ?? "").trim();
    if (!tokenHash) return { ok: false, message: LINK_FAILED };
    const supabase = await getSupabaseServerClientForRequest();
    const { data: verified, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error || !verified.user) return { ok: false, message: LINK_FAILED };
    return { ok: true, href: await afterSignInHref(supabase, verified.user, data.next) };
  });

/** The code from the sign-in email (6 digits on this project), typed on /signin. */
export const verifyEmailCode = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; code: string; next?: string }) => data)
  .handler(async ({ data }): Promise<Result> => {
    const code = normalizeEmailCode(data.code ?? "");
    const email = (data.email ?? "").trim().toLowerCase();
    if (!code || !email) return { ok: false, message: CODE_FAILED };
    const supabase = await getSupabaseServerClientForRequest();
    const { data: verified, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    if (error || !verified.user) return { ok: false, message: CODE_FAILED };
    return { ok: true, href: await afterSignInHref(supabase, verified.user, data.next) };
  });
