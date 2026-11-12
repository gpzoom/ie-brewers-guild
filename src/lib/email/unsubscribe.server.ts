import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { checkUnsubscribeCore, setSubscriptionCore, supabaseUnsubscribeStore } from "./unsubscribe-core";

// `cloudflare:workers` env resolves reliably only inside a createServerFn
// handler (see readHoursConfirmSecret in src/lib/hours/confirm-token.server.ts).
async function readSecret(): Promise<string | undefined> {
  const { env } = await import("cloudflare:workers");
  return (env as { HOURS_CONFIRM_SECRET?: string }).HOURS_CONFIRM_SECRET;
}

/** Read-only check for the page loader; never writes (mail scanners prefetch links). */
export const checkUnsubscribe = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const secret = await readSecret();
    if (!secret) return { valid: false, unsubscribed: false };
    const supabase = await getSupabaseServiceRoleClient();
    return checkUnsubscribeCore({ token: data.token, secret, store: supabaseUnsubscribeStore(supabase) });
  });

/** The write, called only from the page's button. */
export const setBroadcastSubscription = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; subscribed: boolean }) => data)
  .handler(async ({ data }) => {
    const secret = await readSecret();
    if (!secret) throw new Error("Server misconfigured.");
    const supabase = await getSupabaseServiceRoleClient();
    const r = await setSubscriptionCore({
      token: data.token,
      subscribed: data.subscribed,
      secret,
      store: supabaseUnsubscribeStore(supabase),
    });
    if (!r.ok) throw new Error("This unsubscribe link isn't valid.");
    return { ok: true as const };
  });
