import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { resolveMemberClaimState, type MemberClaimState } from "@/lib/guild/member-claim-state";
import type { MemberRow, MemberUserRow } from "@/lib/supabase/types";

export type RosterEntry = {
  member: MemberRow;
  claimState: MemberClaimState;
  ownerEmail: string | null;
};

/**
 * Lists every member with its real roster state (spec, "Roles" and
 * "Migrating the existing members"). auth.users isn't queryable through
 * the normal RLS-scoped client, so claim state is resolved per-member via
 * the service-role client's auth.admin.getUserById() -- one call per
 * member that already has an owner in member_users (this plan's Decision
 * 15: acceptable at the Guild's roster scale, revisit only if it grows by
 * orders of magnitude).
 */
export const getRoster = createServerFn({ method: "GET" }).handler(async (): Promise<RosterEntry[]> => {
  const supabase = await getSupabaseServerClientForRequest();

  const { data: members, error: membersError } = await supabase.from("members").select("*").order("business_name");
  if (membersError) throw new Error(membersError.message);

  const { data: memberUsers, error: memberUsersError } = await supabase.from("member_users").select("*");
  if (memberUsersError) throw new Error(memberUsersError.message);

  const memberUsersByMemberId = new Map<string, MemberUserRow[]>();
  for (const row of (memberUsers ?? []) as MemberUserRow[]) {
    const list = memberUsersByMemberId.get(row.member_id) ?? [];
    list.push(row);
    memberUsersByMemberId.set(row.member_id, list);
  }

  const serviceClient = await getSupabaseServiceRoleClient();
  const entries: RosterEntry[] = [];

  for (const member of (members ?? []) as MemberRow[]) {
    const owners = memberUsersByMemberId.get(member.id) ?? [];
    const owner = owners.find((row) => row.role === "owner") ?? owners[0] ?? null;

    let lastSignInAt: string | null = null;
    let ownerEmail: string | null = null;
    if (owner) {
      const { data: userData } = await serviceClient.auth.admin.getUserById(owner.user_id);
      lastSignInAt = userData?.user?.last_sign_in_at ?? null;
      ownerEmail = userData?.user?.email ?? null;
    }

    entries.push({
      member,
      claimState: resolveMemberClaimState({ hasMemberUser: owners.length > 0, lastSignInAt }),
      ownerEmail,
    });
  }

  return entries;
});
