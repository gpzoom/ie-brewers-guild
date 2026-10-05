import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { afterSignInHref } from "@/lib/auth/after-sign-in.server";
import { confirmPageHref } from "@/lib/auth/sign-in-link";

/**
 * The magic-link landing page. A real request/response cycle (server.handlers,
 * not createServerFn) is needed here because exchangeCodeForSession must set
 * cookies on the actual response before the redirect happens.
 *
 * `next` (the Member Portal link, /signin?next=/portal) is re-validated with
 * the same allowlist sign-in used; the query string is attacker-editable
 * between the email and here. A valid `next` wins for everyone except a
 * Guild admin who isn't currently editing as a member -- they still go to
 * /guild. Someone with no member link yet also follows `next`, because
 * /portal is where pending invites are accepted (and it explains itself
 * when there's nothing to accept). Without a valid `next`, role routing is
 * unchanged.
 *
 * Before routing, a pending Guild admin invite for the signed-in address is
 * accepted (docs/member-profiles.md, "Super admin" > "Guild admins
 * screen"), so a new Guild admin lands in /guild on their first sign-in.
 */
export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        // A link from the new email template carries a token hash: send it
        // on to the Confirm sign-in page (sign-in-link.ts). Opening a link
        // must never use it up -- spam filters open links too.
        const confirm = confirmPageHref(url.searchParams);
        if (confirm) throw redirect({ href: confirm });

        const code = url.searchParams.get("code");
        const supabase = await getSupabaseServerClientForRequest();

        if (!code) {
          throw redirect({ href: "/signin?notice=missing-code" });
        }

        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error || !data.user) {
          throw redirect({ href: "/signin?notice=invalid-link" });
        }

        throw redirect({ href: await afterSignInHref(supabase, data.user, url.searchParams.get("next")) });
      },
    },
  },
});
