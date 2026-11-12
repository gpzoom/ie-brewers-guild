import type { SupabaseClient } from "@supabase/supabase-js";
import { pickOwnerLevelUserIds } from "@/lib/members/account-user";
import { guildInboxFor, type TransactionalEmailPayload } from "@/lib/email/build-email-content";

/**
 * "The member" in the spec's transactional-email table, for a trigger whose
 * payload carries only memberId (creator_upload_pending, hours_stale), is
 * the owner and every co-owner of the member (see pickOwnerLevelUserIds). A
 * handed-off location's business manager is an editor row and never
 * receives these.
 * Returns [] when the member has no member_users row yet, or when no
 * recipient's user can be looked up -- both mean "no one to email," which the
 * caller (send.ts) treats as a non-error, not a send failure. A single user
 * that can't be looked up is dropped; the others still get the email.
 */
async function resolveMemberOwnerEmails(supabase: SupabaseClient, memberId: string): Promise<string[]> {
  const { data: rows, error: memberUserError } = await supabase
    .from("member_users")
    .select("user_id, role")
    .eq("member_id", memberId)
    .order("created_at", { ascending: true });
  if (memberUserError) throw new Error(memberUserError.message);
  const userIds = pickOwnerLevelUserIds(rows as Array<{ user_id: string; role: string | null }> | null);

  const emails: string[] = [];
  for (const userId of userIds) {
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError || !userData?.user?.email) continue;
    emails.push(userData.user.email);
  }
  return emails;
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
): Promise<string[]> {
  switch (payload.trigger) {
    case "member_invited":
    case "editor_invited":
    case "guild_admin_invited":
    case "business_invited":
    case "business_location_added":
    case "location_handoff_invited":
      return [payload.email];
    case "contact_confirmation":
      return [payload.email];
    case "support_message":
    case "signin_help":
      return [payload.to];
    case "contact_form_submitted":
    case "type_change_requested":
      return [guildInboxFor(siteUrl)];
    case "creator_upload_pending":
    case "hours_stale":
      return resolveMemberOwnerEmails(supabase, payload.memberId);
  }
}
