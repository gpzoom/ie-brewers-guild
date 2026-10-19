import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSuperAdmin } from "@/lib/auth/super-admin";

/**
 * The super admin's Help messages screen (docs/member-profiles.md, "Help
 * button"): the messages sent with the Help button, newest first, as
 * Waiting or Done. No I/O of its own -- the clients are passed in, so the
 * cores can be tested with fakes.
 */

export type HelpMessageShow = "waiting" | "done" | "all";

export function parseHelpMessageShow(value: unknown): HelpMessageShow {
  return value === "done" || value === "all" ? value : "waiting";
}

/** bug and feature come from the Help button; signin from /signin/help (sign-in help). */
export type HelpMessageKind = "bug" | "feature" | "signin";

/** The pill on each message. */
export const HELP_MESSAGE_KIND_LABEL: Record<HelpMessageKind, string> = {
  bug: "Problem/bug",
  feature: "Feature request",
  signin: "Sign-in help",
};

export type HelpMessageView = {
  id: string;
  kind: HelpMessageKind;
  firstName: string;
  email: string;
  message: string;
  memberName: string | null;
  /** Sign-in help: the address they used to sign in with. */
  previousEmail: string | null;
  sentByGuildAdmin: boolean;
  pagePath: string | null;
  userAgent: string | null;
  status: "waiting" | "done";
  createdAt: string;
  handledAt: string | null;
};

export type HelpMessageRow = {
  id: string;
  kind: HelpMessageKind;
  first_name: string;
  email: string;
  message: string;
  member_name: string | null;
  previous_email: string | null;
  sent_by_guild_admin: boolean;
  page_path: string | null;
  user_agent: string | null;
  status: "waiting" | "done";
  created_at: string;
  handled_at: string | null;
};

export function toHelpMessageView(row: HelpMessageRow): HelpMessageView {
  return {
    id: row.id,
    kind: row.kind,
    firstName: row.first_name,
    email: row.email,
    message: row.message,
    memberName: row.member_name,
    previousEmail: row.previous_email ?? null,
    sentByGuildAdmin: row.sent_by_guild_admin,
    pagePath: row.page_path,
    userAgent: row.user_agent,
    status: row.status,
    createdAt: row.created_at,
    handledAt: row.handled_at,
  };
}

const UUID = /^[0-9a-f-]{36}$/i;

export function validateHelpStatusInput(data: unknown): { id: string; done: boolean } {
  const input = data as { id?: unknown; done?: unknown } | null;
  if (typeof input?.id !== "string" || !UUID.test(input.id))
    throw new Error("That message wasn't found.");
  if (typeof input.done !== "boolean") throw new Error("Choose done or waiting.");
  return { id: input.id, done: input.done };
}

/**
 * Marks a message done, or back to waiting. The super admin check runs
 * first; only then is the service-role client opened (it bypasses the
 * table's policies, which allow no updates at all).
 */
export async function setHelpMessageStatusCore(
  sessionClient: SupabaseClient,
  openService: () => Promise<SupabaseClient>,
  input: { id: string; done: boolean },
  now: Date,
): Promise<void> {
  const actor = await requireSuperAdmin(sessionClient, "mark Help messages");
  const service = await openService();
  const { data, error } = await service
    .from("support_messages")
    .update(
      input.done
        ? { status: "done", handled_at: now.toISOString(), handled_by_user_id: actor.userId }
        : { status: "waiting", handled_at: null, handled_by_user_id: null },
    )
    .eq("id", input.id)
    .select("id");
  if (error) throw new Error("Couldn't update that message — try again.");
  if (!data || data.length === 0) throw new Error("That message wasn't found.");
}
