import { createAuthUser, findAuthUserIdByEmail } from "@/lib/guild/auth-accounts.server";
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendTransactionalEmail } from "@/lib/email/send";
import { inviteMemberCore } from "@/lib/guild/invite-member-core";
import { resendInviteCore } from "@/lib/guild/resend-invite-core";
import { requireGuildAdminSession } from "@/lib/guild/member-business";

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

    // Opened only once the core gets past its checks (the one-manager
    // refusal runs on the caller's own session, before any service key).
    let serviceClientPromise: ReturnType<typeof getSupabaseServiceRoleClient> | null = null;
    const service = () => (serviceClientPromise ??= getSupabaseServiceRoleClient());

    // The steps (and the "already has an account" case) live in
    // invite-member-core.ts, tested there; this wires Supabase and the email.
    const result = await inviteMemberCore(
      {
        async isOneManagerLocation(memberId) {
          const { data: member, error } = await supabase
            .from("members")
            .select("business_id")
            .eq("id", memberId)
            .maybeSingle();
          if (error) throw new Error(error.message);
          const businessId = (member as { business_id: string | null } | null)?.business_id;
          if (!businessId) return false;
          const { data: business, error: businessError } = await supabase
            .from("businesses")
            .select("management_mode")
            .eq("id", businessId)
            .maybeSingle();
          if (businessError) throw new Error(businessError.message);
          return (business as { management_mode: string } | null)?.management_mode === "one_manager";
        },
        async hasOwner(memberId) {
          const serviceClient = await service();
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
          return createAuthUser(await service(), email);
        },
        async findUserIdByEmail(email) {
          return findAuthUserIdByEmail(await service(), email);
        },
        async linkOwner(memberId, userId) {
          const { error } = await supabase.from("member_users").insert({ member_id: memberId, user_id: userId, role: "owner" });
          if (!error) return { ok: true as const };
          // A 23505 is harmless only when it's this exact link (a
          // double-click). The one-owner index can also raise 23505 (an
          // owner was added since the check), and that one is a failure.
          if (error.code === "23505") {
            const { data: link } = await (await service())
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
          await (await service()).auth.admin.deleteUser(userId);
        },
        async sendInviteEmail(memberId, email) {
          // The email names the business (owner, 2026-10-19).
          const { data: member } = await (await service())
            .from("members")
            .select("business_name")
            .eq("id", memberId)
            .maybeSingle();
          const businessName = (member as { business_name: string | null } | null)?.business_name?.trim() || null;
          await sendTransactionalEmail({ trigger: "member_invited", memberId, email, businessName });
        },
      },
      { memberId: data.memberId, email: data.email },
    );

    return { ok: true as const, userId: result.userId };
  });

/**
 * The roster's "Re-invite" (resend-invite-core.ts): the invite email again,
 * to the address already invited, for someone who hasn't signed in yet.
 * The Guild admin check runs before the service-role client is opened.
 */
export const resendInvite = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    await requireGuildAdminSession();
    const service = await getSupabaseServiceRoleClient();
    return resendInviteCore(
      {
        async loadMember(memberId) {
          const { data: member, error } = await service
            .from("members")
            .select("business_name, business_id")
            .eq("id", memberId)
            .maybeSingle();
          if (error || !member) throw new Error("That member no longer exists.");
          const row = member as { business_name: string | null; business_id: string | null };
          if (!row.business_id) return { businessName: row.business_name, business: null };
          const { data: business } = await service
            .from("businesses")
            .select("id, name, management_mode, manager_user_id")
            .eq("id", row.business_id)
            .maybeSingle();
          if (!business) return { businessName: row.business_name, business: null };
          const { count } = await service
            .from("members")
            .select("id", { count: "exact", head: true })
            .eq("business_id", row.business_id);
          const b = business as { id: string; name: string; management_mode: "separate" | "one_manager"; manager_user_id: string | null };
          return {
            businessName: row.business_name,
            business: { id: b.id, name: b.name, mode: b.management_mode, managerUserId: b.manager_user_id, locationCount: count ?? 1 },
          };
        },
        async loadOwnerUserId(memberId) {
          const { data: owner } = await service
            .from("member_users")
            .select("user_id")
            .eq("member_id", memberId)
            .eq("role", "owner")
            .limit(1)
            .maybeSingle();
          return (owner as { user_id: string } | null)?.user_id ?? null;
        },
        async loadUser(userId) {
          const { data: userData } = await service.auth.admin.getUserById(userId);
          if (!userData?.user) return null;
          return { email: userData.user.email ?? null, lastSignInAt: userData.user.last_sign_in_at ?? null };
        },
        async sendMemberInvite(payload) {
          await sendTransactionalEmail({ trigger: "member_invited", ...payload });
        },
        async sendBusinessInvite(payload) {
          await sendTransactionalEmail({ trigger: "business_invited", ...payload });
        },
      },
      data.memberId,
    );
  });
