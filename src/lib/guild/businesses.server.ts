import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendTransactionalEmail } from "@/lib/email/send";
import { createAuthUser, findAuthUserIdByEmail } from "@/lib/guild/auth-accounts.server";
import { inviteBusinessManagerCore } from "@/lib/guild/business-invite-core";
import type { BusinessManagementMode } from "@/lib/supabase/types";

/**
 * The Guild roster's business actions (spec 2026-10-15). Permission checks
 * and audit logging live in the SQL functions (20261016100000); these run
 * on the caller's own session so is_guild_admin() sees the real person.
 */

async function requireGuildAdminSession(): Promise<SupabaseClient> {
  const supabase = await getSupabaseServerClientForRequest();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error("Not signed in.");
  const { data: profile } = await supabase.from("profiles").select("is_guild_admin").eq("id", userData.user.id).maybeSingle();
  if (!profile?.is_guild_admin) throw new Error("Only a Guild admin can do this.");
  return supabase;
}

export const setBusinessMode = createServerFn({ method: "POST" })
  .inputValidator((data: { businessId: string; mode: BusinessManagementMode }) => data)
  .handler(async ({ data }) => {
    const supabase = await requireGuildAdminSession();
    const { error } = await supabase.rpc("set_business_mode", { p_business_id: data.businessId, p_mode: data.mode });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Part of, for Task 5's Add member too. Emails the manager when a one-manager business gained a location. */
export async function applyMemberBusiness(supabase: SupabaseClient, memberId: string, target: string | null): Promise<void> {
  const { data, error } = await supabase.rpc("set_member_business", { p_member_id: memberId, p_target: target });
  if (error) throw new Error(error.message);
  const result = data as { business_id: string | null; notify_manager_user_id: string | null };
  if (!result.notify_manager_user_id || !result.business_id) return;

  try {
    const service = await getSupabaseServiceRoleClient();
    const [{ data: userData }, { data: business }, { data: member }] = await Promise.all([
      service.auth.admin.getUserById(result.notify_manager_user_id),
      service.from("businesses").select("name").eq("id", result.business_id).single(),
      service.from("members").select("city").eq("id", memberId).single(),
    ]);
    const email = userData?.user?.email;
    if (!email || !business || !member) return;
    await sendTransactionalEmail({
      trigger: "business_location_added",
      memberId,
      businessName: business.name as string,
      city: member.city as string,
      email,
    });
  } catch (err) {
    console.error("sendTransactionalEmail(business_location_added) failed", err);
  }
}

export const setMemberBusiness = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; target: string | null }) => data)
  .handler(async ({ data }) => {
    const supabase = await requireGuildAdminSession();
    await applyMemberBusiness(supabase, data.memberId, data.target);
    return { ok: true as const };
  });

export const inviteBusinessManager = createServerFn({ method: "POST" })
  .inputValidator((data: { businessId: string; email: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await requireGuildAdminSession();
    const service = await getSupabaseServiceRoleClient();
    const result = await inviteBusinessManagerCore(
      {
        async loadBusiness(businessId) {
          const { data: business, error } = await supabase
            .from("businesses")
            .select("name, management_mode, manager_user_id")
            .eq("id", businessId)
            .single();
          if (error || !business) throw new Error("That business no longer exists.");
          const { count } = await supabase.from("members").select("id", { count: "exact", head: true }).eq("business_id", businessId);
          return {
            name: business.name as string,
            mode: business.management_mode as BusinessManagementMode,
            managerUserId: (business.manager_user_id as string | null) ?? null,
            locationCount: count ?? 0,
          };
        },
        createUser: (email) => createAuthUser(service, email),
        findUserIdByEmail: (email) => findAuthUserIdByEmail(service, email),
        async linkManager(businessId, userId) {
          const { error } = await supabase.rpc("link_business_manager", { p_business_id: businessId, p_user_id: userId });
          return error ? { ok: false as const, message: error.message } : { ok: true as const };
        },
        async deleteUser(userId) {
          await service.auth.admin.deleteUser(userId);
        },
        async sendInviteEmail(payload) {
          await sendTransactionalEmail({ trigger: "business_invited", ...payload });
        },
      },
      { businessId: data.businessId, email: data.email },
    );
    return { ok: true as const, userId: result.userId };
  });
