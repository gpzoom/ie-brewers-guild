import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendTransactionalEmail } from "@/lib/email/send";

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

/** The signed-in Guild admin's own session client (permission checks live in SQL; this is the first gate). */
export async function requireGuildAdminSession(): Promise<SupabaseClient> {
  const supabase = await getSupabaseServerClientForRequest();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error("Not signed in.");
  const { data: profile } = await supabase.from("profiles").select("is_guild_admin").eq("id", userData.user.id).maybeSingle();
  if (!profile?.is_guild_admin) throw new Error("Only a Guild admin can do this.");
  return supabase;
}
