import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { resolveCallbackRedirect, resolveUserRoleAndTarget } from "@/lib/auth/role-routing";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { readImpersonationState } from "@/lib/guild/impersonation.server";
import { acceptGuildAdminInvitesAtSignIn } from "@/lib/guild/guild-admins.server";

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
        const code = url.searchParams.get("code");
        const supabase = await getSupabaseServerClientForRequest();

        if (!code) {
          throw redirect({ href: "/signin?notice=missing-code" });
        }

        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error || !data.user) {
          throw redirect({ href: "/signin?notice=invalid-link" });
        }

        await acceptGuildAdminInvitesAtSignIn({ id: data.user.id, email: data.user.email });
        const routing = await resolveUserRoleAndTarget(supabase, data.user.id);
        const next = safeNextPath(url.searchParams.get("next"));

        // Only a Guild admin's impersonation matters here; the cookie is read
        // (and verified) just for them.
        let isImpersonating = false;
        if (next && routing.role === "guild_admin") {
          const impersonation = await readImpersonationState();
          isImpersonating = !!impersonation && impersonation.actorUserId === data.user.id;
        }

        throw redirect({ href: resolveCallbackRedirect(routing, next, isImpersonating) });
      },
    },
  },
});
