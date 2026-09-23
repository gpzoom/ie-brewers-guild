import { createServerFn } from "@tanstack/react-start";
import { verifyHoursConfirmToken } from "@/lib/hours/confirm-token";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * `cloudflare:workers`'s `env` only resolves reliably inside a real
 * createServerFn/createServerOnlyFn handler, not inside a route loader or a
 * bare `server.handlers` function (src/lib/supabase/server.ts's own doc
 * comment; this exact mistake already caused a real bug earlier in this
 * plan for require-member-session.server.ts). Both functions below read it
 * from inside their own `.handler(...)` body for that reason.
 */
async function readHoursConfirmSecret(): Promise<string | undefined> {
  const { env } = await import("cloudflare:workers");
  return (env as { HOURS_CONFIRM_SECRET?: string }).HOURS_CONFIRM_SECRET;
}

/**
 * Read-only verification, used by the confirm route's loader to decide what
 * to render (a live confirm button vs. an "expired/invalid" message). Does
 * NOT touch the database -- the actual state change only happens in
 * confirmHoursStale below, and only from an explicit button click, never
 * from this GET check. This split exists specifically so that an email
 * security scanner's automatic GET-prefetch of the link (Microsoft Defender
 * for Office 365 Safe Links, Proofpoint, Mimecast, etc. -- standard,
 * widely-deployed behavior, not hypothetical) can't silently mark a
 * member's hours confirmed before the member ever opens the email.
 */
export const checkHoursConfirmToken = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const secret = await readHoursConfirmSecret();
    if (!secret) return { valid: false as const, reason: "Server misconfigured." };
    return verifyHoursConfirmToken(data.token, secret);
  });

/**
 * The actual state change. Re-verifies the token itself rather than trusting
 * the loader's earlier verdict -- cheap, and the correct practice for a
 * mutation reachable over the network on its own RPC path, not just
 * theater: this function's endpoint is independently callable regardless of
 * whether the page's loader ever ran.
 */
export const confirmHoursStale = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const secret = await readHoursConfirmSecret();
    if (!secret) throw new Error("Server misconfigured.");

    const result = await verifyHoursConfirmToken(data.token, secret);
    if (!result.valid) throw new Error(result.reason);

    const supabase = await getSupabaseServiceRoleClient();
    // .select("id") + row-count check -- same pattern as cover.server.ts's
    // updateCoverAsset/updateCoverCrop: a service-role update against a
    // member row that no longer exists (e.g. deleted after the token was
    // signed) returns success with zero rows, not an `error`, so the row
    // count is the only signal that the write actually did anything.
    const { data: updated, error } = await supabase
      .from("members")
      .update({ hours_confirmed_at: new Date().toISOString() })
      .eq("id", result.memberId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("This member account no longer exists.");
    }

    return { ok: true as const };
  });
