import { createServerOnlyFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
