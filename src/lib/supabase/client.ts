import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side, session-aware Supabase client. Same exported name and
 * signature as Phase 3 left it — every existing caller keeps working
 * unchanged — but now backed by createBrowserClient (from @supabase/ssr)
 * instead of a bare anon-key createClient with persistSession: false. This
 * is what lets the browser track a signed-in session via cookies at all;
 * Phase 3 had no auth, so it didn't need to.
 *
 * Safe to memoize as a module-level singleton, UNLIKE the new per-request
 * server client in server.ts: there is exactly one browser session per
 * page load in this JS runtime, so there is no cross-user leak risk here.
 * That risk is specific to a single Worker isolate serving many different
 * users' requests over its lifetime, which simply doesn't describe a
 * browser tab.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let browserClient: SupabaseClient | undefined;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Set both in .env locally and as " +
        "Cloudflare Workers Builds build variables in production/staging.",
    );
  }
  if (!browserClient) {
    browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return browserClient;
}
