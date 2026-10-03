import { createServerOnlyFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { getCookies, setCookie } from "@tanstack/react-start/server";

/**
 * Server-only Supabase clients. Both exports are createServerOnlyFns --
 * call them from inside a createServerFn handler (as
 * src/lib/members/member-profile.server.ts and the private-media
 * streaming route do), not directly from a route loader. Loaders are
 * isomorphic and bundled for the client too, so `cloudflare:workers`
 * does not resolve reliably there.
 *
 * Later phases (Member Admin, Guild Admin, data import) must import
 * these two functions rather than re-creating their own Supabase client
 * setup (this plan's Decisions section).
 */

type WorkerEnv = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

let anonClient: SupabaseClient | undefined;
let serviceRoleClient: SupabaseClient | undefined;

const getWorkerEnv = createServerOnlyFn(async (): Promise<WorkerEnv> => {
  const { env } = await import("cloudflare:workers");
  return env as WorkerEnv;
});

/** Anon-key client for server-side reads of published, public data (RLS-scoped). */
export const getSupabaseServerClient = createServerOnlyFn(async (): Promise<SupabaseClient> => {
  if (anonClient) return anonClient;
  const env = await getWorkerEnv();
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in the Worker environment.");
  }
  anonClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  return anonClient;
});

/**
 * Service-role client -- bypasses RLS entirely. Only for code that
 * independently re-implements the exact access rule it needs before
 * using it (the private member-media streaming route is the only
 * consumer in this plan). Never pipe unauthenticated input into a query
 * built on this client without that check.
 */
export const getSupabaseServiceRoleClient = createServerOnlyFn(async (): Promise<SupabaseClient> => {
  if (serviceRoleClient) return serviceRoleClient;
  const env = await getWorkerEnv();
  if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the Worker environment.");
  }
  serviceRoleClient = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return serviceRoleClient;
});

/**
 * Session-aware, per-request Supabase server client. getSupabaseServerClient()
 * above is anon-key-only and carries no user session at all (Phase 3 had no
 * auth); this is the client every admin route and mutation uses instead, so
 * RLS's is_member_editor()/is_guild_admin() policies see the real signed-in
 * user.
 *
 * Bound to getCookies()/setCookie() from @tanstack/react-start/server,
 * which read/write the current request's cookies via an AsyncLocalStorage-held
 * h3 event — that context only exists while a real request is in flight, so
 * this must only ever be called from inside a createServerFn handler or a
 * file route's server.handlers, never from a route loader or module scope.
 * Uses getAll/setAll, never a single-cookie get/set adapter, because
 * Supabase chunks large session JWTs across multiple cookies and a
 * single-cookie adapter silently drops the overflow chunks.
 *
 * CRITICAL — read before "cleaning this up": this function is deliberately
 * a plain async function, NOT wrapped in createServerOnlyFn and NOT
 * memoized, unlike getSupabaseServerClient/getSupabaseServiceRoleClient
 * above. Those two are safe to cache at module scope because the anon key
 * carries no per-user state — the same cached client is correct for every
 * request. This client is bound to ONE request's cookies. If it were cached
 * the same way, the FIRST request's signed-in session would leak into every
 * later request this Worker isolate happens to handle for its lifetime —
 * a severe cross-user account-takeover bug, not a theoretical one. Call
 * this fresh, every single time, and never store its return value anywhere
 * that outlives the request that created it.
 */
export async function getSupabaseServerClientForRequest() {
  const env = await getWorkerEnv();
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in the Worker environment.");
  }

  return createServerClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return Object.entries(getCookies()).map(([name, value]) => ({ name, value: value ?? "" }));
      },
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          setCookie(name, value, options as Parameters<typeof setCookie>[2]);
        }
      },
    },
  });
}
