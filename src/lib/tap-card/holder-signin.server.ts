import type { SupabaseClient } from "@supabase/supabase-js";
import { generateUploadToken, hashUploadToken } from "@/lib/media/upload-tokens";
import { sendTransactionalEmail } from "@/lib/email/send";
import { resolveEmailSiteUrl } from "@/lib/email/build-email-content";
import { currentRequestUrl } from "@/lib/request-url.server";
import { LOGIN_TOKEN_TTL_MINUTES } from "@/lib/tap-card/tap-card-cookies.server";
import { generateSignInCode, signInCodeHash, type SignInCodeStore } from "@/lib/tap-card/signin-code";

/**
 * Emails a holder a single-use, 60-minute sign-in link (no createServerFn here).
 * `next` (already checked with safeHolderNext) is where the link lands afterward.
 */
export async function sendHolderSignInLink(service: SupabaseClient, holderId: string, email: string, next: string | null = null): Promise<void> {
  const raw = generateUploadToken();
  const id = crypto.randomUUID();
  const code = generateSignInCode();
  const { error } = await service.from("tap_card_login_tokens").insert({
    id,
    holder_id: holderId,
    token_hash: await hashUploadToken(raw),
    code_hash: await signInCodeHash(id, code),
    expires_at: new Date(Date.now() + LOGIN_TOKEN_TTL_MINUTES * 60 * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
  const link = `${resolveEmailSiteUrl(currentRequestUrl())}/card/login/${raw}${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  await sendTransactionalEmail({ trigger: "tap_card_signin_link", email, link, code });
}

/** The sign-in code's rows for one holder (tap_card_login_tokens). */
export function signInCodeStore(service: SupabaseClient, holderId: string): SignInCodeStore {
  return {
    async latest() {
      const { data, error } = await service
        .from("tap_card_login_tokens")
        .select("id, code_hash, code_tries")
        .eq("holder_id", holderId)
        .is("used_at", null)
        .not("code_hash", "is", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { id: data.id, codeHash: data.code_hash, tries: data.code_tries } : null;
    },
    async addTry(id, seen) {
      const { data, error } = await service
        .from("tap_card_login_tokens")
        .update({ code_tries: seen + 1 })
        .eq("id", id)
        .eq("code_tries", seen)
        .select("id");
      if (error) throw new Error(error.message);
      return (data ?? []).length === 1;
    },
    async claim(id) {
      const { data, error } = await service
        .from("tap_card_login_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", id)
        .is("used_at", null)
        .select("id");
      if (error) throw new Error(error.message);
      return (data ?? []).length === 1;
    },
    async burn(id) {
      const { error } = await service.from("tap_card_login_tokens").update({ used_at: new Date().toISOString() }).eq("id", id).is("used_at", null);
      if (error) throw new Error(error.message);
    },
  };
}
