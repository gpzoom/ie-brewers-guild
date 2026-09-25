import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendTransactionalEmail } from "@/lib/email/send";

/**
 * "Invite": supabase.auth.admin.createUser() creates the auth.users row
 * immediately WITHOUT Supabase sending any email of its own. (It used to
 * be inviteUserByEmail(), which sent Supabase's generic invite email on
 * top of our own "Member invited" email below -- two emails for one
 * invite. Ours is the only one needed: it points to /signin, where the
 * member gets a magic link like any other sign-in.) Roster state is
 * unaffected -- "invited, not signed in" is read from that user's
 * last_sign_in_at, which stays null until their first real sign-in.
 * email_confirm: true because the Guild admin is vouching for the address,
 * matching scripts/seed-guild-admin.ts. Once the user's id comes back, a
 * member_users row is inserted with role = 'owner'. The "Member invited"
 * email fires right after, wrapped in try/catch so a send failure never
 * blocks the invite/DB-write from succeeding -- same pattern as every
 * other sendTransactionalEmail call site in this codebase.
 *
 * The is_guild_admin check below MUST run before the service-role client
 * is ever touched: this createServerFn is a real, independently
 * network-reachable HTTP endpoint (the RPC boundary this codebase relies
 * on for every client-called server function) regardless of whether the
 * roster UI is the only thing that calls it -- without this check, any
 * caller could make this Supabase project send real invite emails to
 * arbitrary addresses using the service-role client, which bypasses RLS
 * entirely.
 */
export const inviteMember = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; email: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error("Not signed in.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_guild_admin")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile?.is_guild_admin) {
      throw new Error("Only a Guild admin can send an invite.");
    }

    const serviceClient = await getSupabaseServiceRoleClient();

    const { data: inviteData, error: inviteError } = await serviceClient.auth.admin.createUser({
      email: data.email,
      email_confirm: true,
    });
    if (inviteError || !inviteData.user) {
      throw new Error(inviteError?.message ?? "Could not send the invite.");
    }

    const { error: memberUserError } = await supabase.from("member_users").insert({
      member_id: data.memberId,
      user_id: inviteData.user.id,
      role: "owner",
    });
    if (memberUserError) {
      // A 23505 unique-violation on (member_id, user_id) means this exact
      // link already exists -- e.g. a double-click, or re-inviting an
      // email that's already linked to this same member -- nothing to
      // roll back, the user this call wanted linked already is. Any other
      // error means the write genuinely failed, so roll back the
      // just-created auth user rather than leaving an orphaned, unlinked
      // one behind.
      if (memberUserError.code !== "23505") {
        await serviceClient.auth.admin.deleteUser(inviteData.user.id).catch((cleanupErr) => {
          console.error(
            "inviteMember: failed to roll back orphaned auth user after member_users insert failure",
            cleanupErr,
          );
        });
        throw new Error(memberUserError.message);
      }
    }

    try {
      await sendTransactionalEmail({ trigger: "member_invited", memberId: data.memberId, email: data.email });
    } catch (err) {
      console.error("sendTransactionalEmail(member_invited) failed", err);
    }

    return { ok: true as const, userId: inviteData.user.id };
  });
