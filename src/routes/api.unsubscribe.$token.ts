import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { oneClickUnsubscribeCore, supabaseUnsubscribeStore } from "@/lib/email/unsubscribe-core";

/**
 * RFC 8058 one-click unsubscribe target (List-Unsubscribe-Post). No session.
 * Deliberately calls the pure core directly, NOT a createServerFn: a route
 * handler that calls a server fn 400s in the built Worker (see the comment in
 * src/routes/api.confirm-hours.$token.tsx).
 */
export const Route = createFileRoute("/api/unsubscribe/$token")({
  server: {
    handlers: {
      // A person (or mail scanner) opening the one-click URL lands on the
      // read-only page; only the page's button or a one-click POST writes.
      GET: async ({ params }) =>
        new Response(null, {
          status: 302,
          headers: { Location: `/unsubscribe/${encodeURIComponent(params.token)}` },
        }),
      POST: async ({ request, params }) => {
        const { env } = await import("cloudflare:workers");
        const secret = (env as { HOURS_CONFIRM_SECRET?: string }).HOURS_CONFIRM_SECRET;
        if (!secret) return new Response("Server misconfigured", { status: 500 });
        const supabase = await getSupabaseServiceRoleClient();
        const result = await oneClickUnsubscribeCore({
          token: params.token,
          body: { contentType: request.headers.get("content-type"), text: () => request.text() },
          secret,
          store: supabaseUnsubscribeStore(supabase),
        });
        return new Response(result.text, { status: result.status, headers: { "Content-Type": "text/plain" } });
      },
    },
  },
});
