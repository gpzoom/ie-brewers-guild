import type { SupabaseClient, User } from "@supabase/supabase-js";
import { resolveCallbackRedirect, resolveUserRoleAndTarget } from "@/lib/auth/role-routing";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { readImpersonationState } from "@/lib/guild/impersonation.server";
import { acceptGuildAdminInvitesAtSignIn } from "@/lib/guild/guild-admins.server";

/**
 * Where someone goes right after signing in -- the same for every way in
 * (the old ?code= link, the Confirm sign-in button, the emailed code). A
 * pending Guild admin invite for their address is accepted first, so a new
 * Guild admin lands in /guild. `next` is re-checked against the allowlist.
 */
export async function afterSignInHref(supabase: SupabaseClient, user: User, nextRaw: unknown): Promise<string> {
  await acceptGuildAdminInvitesAtSignIn({ id: user.id, email: user.email });
  const routing = await resolveUserRoleAndTarget(supabase, user.id);
  const next = safeNextPath(nextRaw);
  // Only a Guild admin's impersonation matters here; the cookie is read
  // (and verified) just for them.
  let isImpersonating = false;
  if (next && routing.role === "guild_admin") {
    const impersonation = await readImpersonationState();
    isImpersonating = !!impersonation && impersonation.actorUserId === user.id;
  }
  return resolveCallbackRedirect(routing, next, isImpersonating);
}
