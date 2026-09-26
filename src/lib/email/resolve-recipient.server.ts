import type { SupabaseClient } from "@supabase/supabase-js";
import { guildInboxFor, type TransactionalEmailPayload } from "@/lib/email/build-email-content";

/**
 * "The member" in the spec's transactional-email table, for a trigger whose
 * payload carries only memberId (creator_upload_pending, hours_stale), is
 * whoever member_users says edits that profile. Uses the exact same "first
 * membership found, ordered by created_at ascending" tie-break rule the
 * Member Admin phase's resolveUserRoleAndTarget already established
 * (src/lib/auth/role-routing.ts) -- not a second, differently-ordered rule.
 * Returns null when the member has no member_users row yet, or when that
 * row's user can't be looked up -- both mean "no one to email," which the
 * caller (send.ts) treats as a non-error, not a send failure.
 */
async function resolveMemberOwnerEmail(supabase: SupabaseClient, memberId: string): Promise<string | null> {
  const { data: memberUser, error: memberUserError } = await supabase
    .from("member_users")
    .select("user_id")
    .eq("member_id", memberId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberUserError) throw new Error(memberUserError.message);
  if (!memberUser?.user_id) return null;

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(memberUser.user_id);
  if (userError || !userData?.user?.email) return null;
  return userData.user.email;
}

/**
 * `siteUrl` is the site the email is being sent from (send.ts passes
 * resolveEmailSiteUrl's result); Guild-bound triggers use that site's inbox
 * (guildInboxFor -- the staging site has its own test inbox).
 */
export async function resolveRecipient(
  payload: TransactionalEmailPayload,
  supabase: SupabaseClient,
  siteUrl: string | null = null,
): Promise<string | null> {
  switch (payload.trigger) {
    case "member_invited":
    case "editor_invited":
      return payload.email;
    case "contact_confirmation":
      return payload.email;
    case "contact_form_submitted":
    case "member_type_changed_in_setup":
    case "type_change_requested":
      return guildInboxFor(siteUrl);
    case "creator_upload_pending":
    case "hours_stale":
      return resolveMemberOwnerEmail(supabase, payload.memberId);
  }
}
