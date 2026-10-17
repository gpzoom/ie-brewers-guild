import type { SupabaseClient } from "@supabase/supabase-js";
import { pickAccountUserId } from "@/lib/members/account-user";
import { guildInboxFor, type TransactionalEmailPayload } from "@/lib/email/build-email-content";

/**
 * "The member" in the spec's transactional-email table, for a trigger whose
 * payload carries only memberId (creator_upload_pending, hours_stale), is
 * the member's account: the owner's member_users row (a handed-off
 * location also has the business manager linked as an editor, who must not
 * receive these), or, when there is no owner row, the first row by
 * created_at ascending (see pickAccountUserId).
 * Returns null when the member has no member_users row yet, or when that
 * row's user can't be looked up -- both mean "no one to email," which the
 * caller (send.ts) treats as a non-error, not a send failure.
 */
async function resolveMemberOwnerEmail(supabase: SupabaseClient, memberId: string): Promise<string | null> {
  const { data: rows, error: memberUserError } = await supabase
    .from("member_users")
    .select("user_id, role")
    .eq("member_id", memberId)
    .order("created_at", { ascending: true });
  if (memberUserError) throw new Error(memberUserError.message);
  const userId = pickAccountUserId(rows as Array<{ user_id: string; role: string | null }> | null);
  if (!userId) return null;

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
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
    case "guild_admin_invited":
    case "business_invited":
    case "business_location_added":
    case "location_handoff_invited":
      return payload.email;
    case "contact_confirmation":
      return payload.email;
    case "support_message":
      return payload.to;
    case "contact_form_submitted":
    case "member_type_changed_in_setup":
    case "type_change_requested":
      return guildInboxFor(siteUrl);
    case "creator_upload_pending":
    case "hours_stale":
      return resolveMemberOwnerEmail(supabase, payload.memberId);
  }
}
