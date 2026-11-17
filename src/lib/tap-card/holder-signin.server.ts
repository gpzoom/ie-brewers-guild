import type { SupabaseClient } from "@supabase/supabase-js";
import { generateUploadToken, hashUploadToken } from "@/lib/media/upload-tokens";
import { sendTransactionalEmail } from "@/lib/email/send";
import { resolveEmailSiteUrl } from "@/lib/email/build-email-content";
import { currentRequestUrl } from "@/lib/request-url.server";
import { LOGIN_TOKEN_TTL_MINUTES } from "@/lib/tap-card/tap-card-cookies.server";

/** Emails a holder a single-use, 60-minute sign-in link (no createServerFn here). */
export async function sendHolderSignInLink(service: SupabaseClient, holderId: string, email: string): Promise<void> {
  const raw = generateUploadToken();
  const { error } = await service.from("tap_card_login_tokens").insert({
    holder_id: holderId,
    token_hash: await hashUploadToken(raw),
    expires_at: new Date(Date.now() + LOGIN_TOKEN_TTL_MINUTES * 60 * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
  const link = `${resolveEmailSiteUrl(currentRequestUrl())}/card/login/${raw}`;
  await sendTransactionalEmail({ trigger: "tap_card_signin_link", email, link });
}
