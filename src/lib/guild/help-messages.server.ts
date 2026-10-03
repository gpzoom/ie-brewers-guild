import { createServerFn } from "@tanstack/react-start";
import {
  getSupabaseServerClientForRequest,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import {
  parseHelpMessageShow,
  setHelpMessageStatusCore,
  toHelpMessageView,
  validateHelpStatusInput,
  type HelpMessageRow,
  type HelpMessageShow,
  type HelpMessageView,
} from "@/lib/guild/help-messages";

/**
 * The super admin's Help messages screen (docs/member-profiles.md, "Help
 * button"). Rows are read through the session client, where the table's
 * select policy lets only the super admin see them; marking one done goes
 * through setHelpMessageStatusCore (super admin check, then the service key).
 */

const PAGE = 200;

export type HelpMessagesPage = {
  messages: HelpMessageView[];
  truncated: boolean;
};

export const getHelpMessages = createServerFn({ method: "GET" })
  .inputValidator((data: { show?: HelpMessageShow }) => ({
    show: parseHelpMessageShow(data?.show),
  }))
  .handler(async ({ data }): Promise<HelpMessagesPage> => {
    const supabase = await getSupabaseServerClientForRequest();
    await requireSuperAdmin(supabase, "read Help messages");

    let query = supabase
      .from("support_messages")
      .select(
        "id, kind, first_name, email, message, member_name, sent_by_guild_admin, page_path, user_agent, status, created_at, handled_at",
      )
      .order("created_at", { ascending: false })
      .limit(PAGE + 1);
    if (data.show !== "all") query = query.eq("status", data.show);

    const { data: rows, error } = await query;
    if (error) throw new Error("Couldn't load Help messages — try again.");
    const list = (rows ?? []) as HelpMessageRow[];
    return { messages: list.slice(0, PAGE).map(toHelpMessageView), truncated: list.length > PAGE };
  });

export const setHelpMessageStatus = createServerFn({ method: "POST" })
  .inputValidator(validateHelpStatusInput)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    await setHelpMessageStatusCore(supabase, getSupabaseServiceRoleClient, data, new Date());
    return { ok: true as const };
  });
