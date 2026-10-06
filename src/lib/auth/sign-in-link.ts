/**
 * Sign-in that works whatever opens the email (owner, 2026-10-05). The old
 * magic link (PKCE) only worked in the browser that asked for it, so a
 * link opened on a phone, in an email app's own browser, or after a spam
 * filter had "clicked" it failed with "invalid or has expired". Now:
 *
 * - The email's link carries a token hash (Supabase template: {{ .RedirectTo }}
 *   &token_hash={{ .TokenHash }}&type=email). /auth/callback sends it on to
 *   /auth/confirm, a page with one button; only pressing it signs in, so a
 *   scanner that merely opens the link can't use it up.
 * - The email also carries a code ({{ .Token }}; 6 digits here), typed on the
 *   sign-in page as a fallback.
 * - Links from the old template (?code=...) still work in /auth/callback.
 */
export const OTP_TYPES = ["email", "magiclink", "signup"] as const;
export type EmailOtpType = (typeof OTP_TYPES)[number];

export function signInRedirectUrl(origin: string, next?: string): string {
  const query = next ? `next=${encodeURIComponent(next)}` : "from=email";
  return `${origin}/auth/callback?${query}`;
}

export function confirmPageHref(params: URLSearchParams): string | null {
  const tokenHash = (params.get("token_hash") ?? "").trim();
  if (!tokenHash) return null;
  const rawType = params.get("type") ?? "";
  const type: EmailOtpType = (OTP_TYPES as readonly string[]).includes(rawType) ? (rawType as EmailOtpType) : "email";
  const out = new URLSearchParams({ token_hash: tokenHash, type });
  const next = params.get("next");
  if (next) out.set("next", next);
  return `/auth/confirm?${out.toString()}`;
}

/** The emailed code, typed by hand: digits only, 6 to 10 of them (Supabase's OTP length setting). */
export function normalizeEmailCode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  return /^\d{6,10}$/.test(digits) ? digits : null;
}
