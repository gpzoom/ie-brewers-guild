import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { resolveUserRoleAndTarget } from "@/lib/auth/role-routing";

/**
 * The magic-link landing page. A real request/response cycle (server.handlers,
 * not createServerFn) is needed here because exchangeCodeForSession must set
 * cookies on the actual response before the redirect happens.
 */
export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const supabase = await getSupabaseServerClientForRequest();

        if (!code) {
          throw redirect({ href: "/signin?notice=missing-code" });
        }

        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error || !data.user) {
          throw redirect({ href: "/signin?notice=invalid-link" });
        }

        const routing = await resolveUserRoleAndTarget(supabase, data.user.id);
        throw redirect({ href: routing.redirectTo });
      },
    },
  },
});
