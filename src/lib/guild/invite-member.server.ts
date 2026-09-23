import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendTransactionalEmail } from "@/lib/email/send";

/**
 * "Invite" (task brief): supabase.auth.admin.inviteUserByEmail() creates
 * the auth.users row immediately, unconfirmed (the decision already made
 * about roster state -- "invited, not signed in" is read from that user's
 * last_sign_in_at, not a new column). Once the invited user's id comes
 * back, a member_users row is inserted with role = 'owner'. The "Member
 * invited" email fires right after, wrapped in try/catch so its current
 * throw (src/lib/email/send.ts isn't implemented until the Contact Form +
 * Resend phase) never blocks the invite/DB-write from succeeding -- same
 * pattern as every other sendTransactionalEmail call site in this
 * codebase.
 */
export const inviteMember = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; email: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const serviceClient = await getSupabaseServiceRoleClient();

    const { data: inviteData, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(data.email);
    if (inviteError || !inviteData.user) {
      throw new Error(inviteError?.message ?? "Could not send the invite.");
    }

    const { error: memberUserError } = await supabase.from("member_users").insert({
      member_id: data.memberId,
      user_id: inviteData.user.id,
      role: "owner",
    });
    if (memberUserError) {
      // Roll back the auth user so a partial failure never leaves an
      // orphaned, unlinked auth.users row behind -- without this, the
      // member would stay stuck "unclaimed" forever and a re-invite for
      // the same email would hit unverified inviteUserByEmail behavior
      // against an already-registered-but-unlinked user.
      await serviceClient.auth.admin.deleteUser(inviteData.user.id).catch((cleanupErr) => {
        console.error(
          "inviteMember: failed to roll back orphaned auth user after member_users insert failure",
          cleanupErr,
        );
      });
      throw new Error(memberUserError.message);
    }

    try {
      await sendTransactionalEmail({ trigger: "member_invited", memberId: data.memberId, email: data.email });
    } catch (err) {
      console.error("sendTransactionalEmail(member_invited) failed", err);
    }

    return { ok: true as const, userId: inviteData.user.id };
  });
