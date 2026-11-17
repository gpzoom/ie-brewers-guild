import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * The Tap Card tables are server-only, so every Guild screen reads and
 * writes them with the service-role client -- after this check on the
 * caller's own session (same check as admin-fill.server.ts).
 */
export async function requireTapCardGuildAdmin(): Promise<{ userId: string; service: Awaited<ReturnType<typeof getSupabaseServiceRoleClient>> }> {
  const supabase = await getSupabaseServerClientForRequest();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) throw new Error("Not signed in.");
  const { data: profile } = await supabase.from("profiles").select("is_guild_admin").eq("id", data.user.id).maybeSingle();
  if (!(profile as { is_guild_admin?: boolean } | null)?.is_guild_admin) {
    throw new Error("Only Guild admins can manage the Tap Card.");
  }
  return { userId: data.user.id, service: await getSupabaseServiceRoleClient() };
}
