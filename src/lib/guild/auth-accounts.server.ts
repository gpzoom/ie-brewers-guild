import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Creating or finding a sign-in account for an invite (the member invite
 * and the business invite share this). createUser sends no email of its
 * own (invite-member.server.ts explains why); email_confirm because the
 * Guild admin is vouching for the address.
 */
export async function createAuthUser(
  service: SupabaseClient,
  email: string,
): Promise<{ ok: true; userId: string } | { ok: false; emailTaken: boolean; message: string }> {
  const { data: created, error } = await service.auth.admin.createUser({ email, email_confirm: true });
  if (!error && created.user) return { ok: true, userId: created.user.id };
  const message = error?.message ?? "Could not send the invite.";
  const emailTaken =
    (error as { code?: string } | null)?.code === "email_exists" || /already (been )?registered/i.test(message);
  return { ok: false, emailTaken, message };
}

/** The Guild has a few hundred accounts at most; 10 pages of 1000 is plenty. */
export async function findAuthUserIdByEmail(service: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const { data: list, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const found = list.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found.id;
    if (list.users.length < 1000) return null;
  }
  return null;
}
