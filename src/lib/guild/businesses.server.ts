import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendTransactionalEmail } from "@/lib/email/send";
import { requireGuildAdminSession } from "@/lib/guild/member-business";
import { applyMemberBusiness } from "@/lib/guild/member-business";
import { createAuthUser, findAuthUserIdByEmail } from "@/lib/guild/auth-accounts.server";
import { inviteBusinessManagerCore } from "@/lib/guild/business-invite-core";
import type { BusinessManagementMode } from "@/lib/supabase/types";

/**
 * The Guild roster's business actions (spec 2026-10-15). Permission checks
 * and audit logging live in the SQL functions (20261016100000); these run
 * on the caller's own session so is_guild_admin() sees the real person.
 * Every action here needs a Guild admin (requireGuildAdminSession), checked
 * before the service-role client is ever opened; One manager and the
 * business Invite are open to every Guild admin since part 4.
 */

export const setBusinessMode = createServerFn({ method: "POST" })
  .inputValidator((data: { businessId: string; mode: BusinessManagementMode }) => data)
  .handler(async ({ data }) => {
    const supabase = await requireGuildAdminSession();
    // p_look_source null: the database picks which location's look the
    // business keeps when it becomes one-manager.
    const { error } = await supabase.rpc("set_business_mode", {
      p_business_id: data.businessId,
      p_mode: data.mode,
      p_look_source: null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

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
          const { count, error: countError } = await supabase
            .from("members")
            .select("id", { count: "exact", head: true })
            .eq("business_id", businessId);
          // Never send an email that says "0 locations".
          if (countError || !count) throw new Error("That business has no locations.");
          return {
            name: business.name as string,
            mode: business.management_mode as BusinessManagementMode,
            managerUserId: (business.manager_user_id as string | null) ?? null,
            locationCount: count,
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
