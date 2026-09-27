import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The super admin check every super-admin-only server function runs FIRST
 * (docs/member-profiles.md, "Super admin" > "Enforcement"): delete member,
 * change a sign-in email, save brand settings, delete a category, the Trail
 * switch, the Guild admins actions and the audit log. It reads the REAL
 * signed-in person through the per-request session client -- auth.uid()
 * never changes while editing as a member, so impersonation can't lend
 * anyone super admin -- and it must run before any service-role client is
 * used, since that client bypasses the database policies.
 *
 * profiles' own RLS lets a user read their own row, so this needs no
 * privileges beyond being signed in. Pure (the client is passed in), so
 * each function's core can be tested with a fake.
 */
export async function requireSuperAdmin(
  sessionClient: SupabaseClient,
  action: string,
): Promise<{ userId: string; email: string | null }> {
  const { data: userData } = await sessionClient.auth.getUser();
  const user = userData?.user;
  if (!user) throw new Error("Not signed in.");

  const { data: profile } = await sessionClient
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!(profile as { is_super_admin?: boolean } | null)?.is_super_admin) {
    throw new Error(`Only the super admin can ${action}.`);
  }
  return { userId: user.id, email: user.email ?? null };
}

/** Whether the signed-in person is the super admin (for what a screen shows; never a permission). */
export async function isSuperAdminSession(sessionClient: SupabaseClient): Promise<boolean> {
  const { data: userData } = await sessionClient.auth.getUser();
  const user = userData?.user;
  if (!user) return false;
  const { data: profile } = await sessionClient
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  return (profile as { is_super_admin?: boolean } | null)?.is_super_admin === true;
}

/**
 * The gate for server functions that go on to use the service-role client
 * (which bypasses every policy): checks for the super admin FIRST, and only
 * then calls `open` to build whatever needs the service key. A Guild admin
 * -- or anyone else -- gets the error and `open` is never called.
 */
export async function withSuperAdmin<T>(
  sessionClient: SupabaseClient,
  action: string,
  open: () => Promise<T>,
): Promise<{ actor: { userId: string; email: string | null }; value: T }> {
  const actor = await requireSuperAdmin(sessionClient, action);
  return { actor, value: await open() };
}
