import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { readImpersonationState } from "@/lib/guild/impersonation.server";
import { shouldRecordAudit } from "@/lib/guild/impersonation-token";
import { recordAuditLogIfImpersonating } from "@/lib/guild/audit-log.server";
import type { ImpersonationState } from "@/lib/guild/impersonation-token";

// Deliberately simple -- matches contact-form-validation.ts's own choice
// not to implement full RFC 5322: a basic shape check is a reasonable bar,
// and Supabase itself rejects anything it can't actually use regardless.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type MemberEmail = { email: string | null };

async function findMemberUserId(memberId: string, sessionClient: SupabaseClient): Promise<string | null> {
  const { data: memberUser } = await sessionClient
    .from("member_users")
    .select("user_id")
    .eq("member_id", memberId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (memberUser?.user_id as string | undefined) ?? null;
}

/**
 * A member's sign-in email lives on auth.users, tied to their profile only
 * through member_users -- never on the members table itself. First row by
 * created_at ascending, matching the same tie-break rule
 * resolveUserRoleAndTarget/resolveRecipient already use for "a member with
 * multiple member_users rows." Returns { email: null } for an unclaimed
 * member (no member_users row yet) -- there is genuinely no account yet.
 *
 * Both clients are injected (same pattern as resolveRecipient.server.ts)
 * so this is directly unit-testable -- calling the createServerFn-wrapped
 * export below in a test never returns its resolved value correctly, since
 * this repo's vitest.config.ts deliberately excludes the TanStack Start
 * Vite plugin that would otherwise split its client/server halves; only
 * this inner function is exercised by tests.
 */
export async function fetchMemberEmail(
  memberId: string,
  sessionClient: SupabaseClient,
  serviceClient: SupabaseClient,
): Promise<MemberEmail> {
  const userId = await findMemberUserId(memberId, sessionClient);
  if (!userId) return { email: null };

  // Reading another user's auth record needs the service-role client --
  // the per-request session client's RLS has no path to an arbitrary
  // auth.users row, by design.
  const { data: userData } = await serviceClient.auth.admin.getUserById(userId);
  return { email: userData?.user?.email ?? null };
}

/**
 * Changes the sign-in email tied to a member's account. Available ONLY
 * while a Guild admin is actively impersonating THIS specific member --
 * the exact same gate recordAuditLogIfImpersonating uses (shouldRecordAudit)
 * -- by explicit product decision (2026-09-24): a member who lets an
 * employee manage their profile, then loses that employee, could otherwise
 * be permanently locked out of their own account, or worse, left exposed
 * to a departed employee who still holds the only working login. The spec's
 * own line ("impersonation cannot change the member's email or sign-in
 * settings... the line between an impersonation feature and an
 * account-takeover feature") is deliberately overridden here, at the site
 * owner's explicit request, in favor of this real-world recovery need --
 * this is NOT a general "any Guild admin, any time" capability; it only
 * works mid-"Edit as them" session against the one member the cookie
 * targets, so it stays tied to a real, auditable admin action.
 *
 * email_confirm: true (matching scripts/seed-guild-admin.ts's own use of
 * the same flag) makes the change effective immediately, rather than
 * leaving it pending on the new address confirming a verification email --
 * the entire point of this feature is unblocking access right now, not
 * adding a second dependency on an email nobody may be able to check yet.
 *
 * Does NOT call recordAuditLogIfImpersonating itself -- that stays in the
 * createServerFn wrapper below, alongside the real (unmocked-in-tests)
 * clients, matching discount.server.ts's own split between pure/injectable
 * logic and its thin I/O wrapper.
 */
export async function changeMemberEmail(
  memberId: string,
  rawNewEmail: string,
  impersonation: ImpersonationState | null,
  sessionClient: SupabaseClient,
  serviceClient: SupabaseClient,
): Promise<{ ok: true; userId: string }> {
  const newEmail = rawNewEmail.trim();
  if (!EMAIL_PATTERN.test(newEmail)) {
    throw new Error("Enter a valid email address.");
  }

  if (!shouldRecordAudit(impersonation, memberId)) {
    throw new Error("Changing a member's sign-in email is only available while editing as them.");
  }

  const userId = await findMemberUserId(memberId, sessionClient);
  if (!userId) {
    throw new Error("This member hasn't been claimed yet — there's no account to update.");
  }

  const { error } = await serviceClient.auth.admin.updateUserById(userId, {
    email: newEmail,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);

  return { ok: true, userId };
}

export const getMemberEmail = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }): Promise<MemberEmail> => {
    const [sessionClient, serviceClient] = await Promise.all([
      getSupabaseServerClientForRequest(),
      getSupabaseServiceRoleClient(),
    ]);
    return fetchMemberEmail(data.memberId, sessionClient, serviceClient);
  });

export const updateMemberEmail = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; newEmail: string }) => data)
  .handler(async ({ data }) => {
    const impersonation = await readImpersonationState();
    const [sessionClient, serviceClient] = await Promise.all([
      getSupabaseServerClientForRequest(),
      getSupabaseServiceRoleClient(),
    ]);
    const { userId } = await changeMemberEmail(data.memberId, data.newEmail, impersonation, sessionClient, serviceClient);

    await recordAuditLogIfImpersonating({
      memberId: data.memberId,
      tableName: "auth.users",
      rowId: userId,
      action: "update",
    });

    return { ok: true as const };
  });
