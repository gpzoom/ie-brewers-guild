import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendTransactionalEmail } from "@/lib/email/send";
import { inviteMemberCore } from "@/lib/guild/invite-member-core";

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
 * An email that already has an account (the person signed in on their own
 * from Member Portal first) is linked as owner instead of failing, and
 * an existing account is never deleted (invite-member-core.ts, 2026-10-05).
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

    // The steps (and the "already has an account" case) live in
    // invite-member-core.ts, tested there; this wires Supabase and the email.
    const result = await inviteMemberCore(
      {
        async hasOwner(memberId) {
          const { data: owner, error } = await serviceClient
            .from("member_users")
            .select("user_id")
            .eq("member_id", memberId)
            .eq("role", "owner")
            .limit(1)
            .maybeSingle();
          if (error) throw new Error(error.message);
          return Boolean(owner);
        },
        async createUser(email) {
          const { data: created, error } = await serviceClient.auth.admin.createUser({ email, email_confirm: true });
          if (!error && created.user) return { ok: true as const, userId: created.user.id };
          const message = error?.message ?? "Could not send the invite.";
          const emailTaken =
            (error as { code?: string } | null)?.code === "email_exists" || /already (been )?registered/i.test(message);
          return { ok: false as const, emailTaken, message };
        },
        async findUserIdByEmail(email) {
          // The Guild has a few hundred accounts at most; 10 pages of 1000 is plenty.
          for (let page = 1; page <= 10; page++) {
            const { data: list, error } = await serviceClient.auth.admin.listUsers({ page, perPage: 1000 });
            if (error) throw new Error(error.message);
            const found = list.users.find((u) => u.email?.toLowerCase() === email);
            if (found) return found.id;
            if (list.users.length < 1000) return null;
          }
          return null;
        },
        async linkOwner(memberId, userId) {
          const { error } = await supabase.from("member_users").insert({ member_id: memberId, user_id: userId, role: "owner" });
          if (!error) return { ok: true as const };
          // A 23505 is harmless only when it's this exact link (a
          // double-click). The one-owner index can also raise 23505 (an
          // owner was added since the check), and that one is a failure.
          if (error.code === "23505") {
            const { data: link } = await serviceClient
              .from("member_users")
              .select("user_id")
              .eq("member_id", memberId)
              .eq("user_id", userId)
              .maybeSingle();
            if (link) return { ok: true as const };
          }
          return { ok: false as const, message: error.message };
        },
        async deleteUser(userId) {
          await serviceClient.auth.admin.deleteUser(userId);
        },
        async sendInviteEmail(memberId, email) {
          await sendTransactionalEmail({ trigger: "member_invited", memberId, email });
        },
      },
      { memberId: data.memberId, email: data.email },
    );

    return { ok: true as const, userId: result.userId };
  });
