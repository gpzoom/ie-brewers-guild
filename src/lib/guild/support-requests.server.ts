import { createServerFn } from "@tanstack/react-start";
import {
  getSupabaseServerClientForRequest,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import type { MemberType } from "@/lib/supabase/types";

/**
 * Member requests on the Guild's Inquiries screen (plan phase 5): open
 * "Request a type change" rows from the portal, for the Guild admin to act
 * on from the roster and then mark handled.
 *
 * Reads and writes go through the signed-in session client, so RLS lets
 * only a Guild admin see every row or mark one handled. The requester's
 * address lives on auth.users, which needs the service-role client -- used
 * only after the explicit Guild admin check below.
 */

export type SupportRequestView = {
  id: string;
  memberId: string;
  memberName: string;
  currentType: MemberType | null;
  requestedType: MemberType | null;
  note: string | null;
  requestedByEmail: string | null;
  createdAt: string;
};

type RequestRow = {
  id: string;
  member_id: string;
  requested_by_user_id: string | null;
  requested_member_type: MemberType | null;
  note: string | null;
  created_at: string;
  members: { business_name: string | null; member_type: MemberType } | null;
};

export const getOpenSupportRequests = createServerFn({ method: "GET" }).handler(
  async (): Promise<SupportRequestView[]> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error("Not signed in.");
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_guild_admin")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile?.is_guild_admin) return [];

    const { data, error } = await supabase
      .from("support_requests")
      .select(
        "id, member_id, requested_by_user_id, requested_member_type, note, created_at, members(business_name, member_type)",
      )
      .eq("status", "open")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as RequestRow[];

    const service = await getSupabaseServiceRoleClient();
    const userIds = [...new Set(rows.flatMap((r) => (r.requested_by_user_id ? [r.requested_by_user_id] : [])))];
    const emails = new Map<string, string | null>();
    await Promise.all(
      userIds.map(async (id) => {
        const { data: user } = await service.auth.admin.getUserById(id);
        emails.set(id, user?.user?.email ?? null);
      }),
    );

    return rows.map((row) => ({
      id: row.id,
      memberId: row.member_id,
      memberName: row.members?.business_name?.trim() || "Unnamed business",
      currentType: row.members?.member_type ?? null,
      requestedType: row.requested_member_type,
      note: row.note,
      requestedByEmail: row.requested_by_user_id ? (emails.get(row.requested_by_user_id) ?? null) : null,
      createdAt: row.created_at,
    }));
  },
);

export const markSupportRequestHandled = createServerFn({ method: "POST" })
  .inputValidator((data: { requestId: string }) => {
    if (typeof data?.requestId !== "string" || data.requestId.length === 0) {
      throw new Error("Missing request.");
    }
    return { requestId: data.requestId };
  })
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error("Not signed in.");
    const { data: updated, error } = await supabase
      .from("support_requests")
      .update({
        status: "handled",
        handled_by_user_id: userData.user.id,
        handled_at: new Date().toISOString(),
      })
      .eq("id", data.requestId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) throw new Error("Couldn't mark that request handled.");
    return { ok: true as const };
  });
