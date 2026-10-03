import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";

export type GuildShellSummary = {
  /** Signed-in Guild admin's email, shown in the top bar (profiles has no name column). */
  adminEmail: string | null;
  /** Inquiries still "open" (not yet marked handled) -- the sidebar's accent badge. */
  openInquiryCount: number | null;
  /** Every members row the roster lists -- the sidebar's muted count. */
  memberCount: number | null;
  /**
   * Help messages still waiting -- the super admin's bell. Null for a Guild
   * admin (the table's select policy would show them nothing anyway).
   */
  waitingHelpCount: number | null;
};

/**
 * The few numbers GuildShell's top bar and sidebar show (artboards
 * GuildMembers / GuildApprovals). Called from src/routes/guild.tsx's own
 * loader, so it re-runs on every /guild navigation and after any
 * router.invalidate() (e.g. marking an inquiry handled).
 *
 * Uses the request's own session client, so RLS already limits both
 * tables to Guild admins; the explicit is_guild_admin check just makes a
 * non-admin caller get nothing rather than whatever RLS happens to allow.
 * Counts use head-only exact counts (no rows transferred). A failed count
 * degrades to null -- the sidebar simply omits it -- rather than taking
 * down every /guild page over a badge.
 */
export const getGuildShellSummary = createServerFn({ method: "GET" }).handler(
  async (): Promise<GuildShellSummary> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    const empty: GuildShellSummary = {
      adminEmail: null,
      openInquiryCount: null,
      memberCount: null,
      waitingHelpCount: null,
    };
    if (!user) return empty;

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_guild_admin, is_super_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.is_guild_admin) return empty;
    const isSuperAdmin = (profile as { is_super_admin?: boolean }).is_super_admin === true;

    const [inquiries, members, help] = await Promise.all([
      supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("members").select("id", { count: "exact", head: true }),
      isSuperAdmin
        ? supabase
            .from("support_messages")
            .select("id", { count: "exact", head: true })
            .eq("status", "waiting")
        : Promise.resolve(null),
    ]);
    if (inquiries.error) console.error("getGuildShellSummary: inquiry count failed", inquiries.error);
    if (members.error) console.error("getGuildShellSummary: member count failed", members.error);
    if (help?.error) console.error("getGuildShellSummary: Help message count failed", help.error);

    return {
      adminEmail: user.email ?? null,
      openInquiryCount: inquiries.error ? null : (inquiries.count ?? 0),
      memberCount: members.error ? null : (members.count ?? 0),
      waitingHelpCount: !help || help.error ? null : (help.count ?? 0),
    };
  },
);
