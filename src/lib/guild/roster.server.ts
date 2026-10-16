import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { resolveMemberClaimState, type MemberClaimState } from "@/lib/guild/member-claim-state";
import type { BusinessRow, MemberRow, MemberUserRow } from "@/lib/supabase/types";
import type { RosterBusiness } from "@/lib/guild/roster-groups";

export type RosterEntry = {
  member: MemberRow;
  claimState: MemberClaimState;
  ownerEmail: string | null;
};

export type RosterData = { entries: RosterEntry[]; businesses: RosterBusiness[] };

/**
 * Lists every member with its real roster state (spec, "Roles" and
 * "Migrating the existing members"). auth.users isn't queryable through
 * the normal RLS-scoped client, so claim state is resolved per-member via
 * the service-role client's auth.admin.getUserById() -- one call per
 * member that already has an owner in member_users (this plan's Decision
 * 15: acceptable at the Guild's roster scale, revisit only if it grows by
 * orders of magnitude).
 */
export const getRoster = createServerFn({ method: "GET" }).handler(async (): Promise<RosterData> => {
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

  const { data: businessRows, error: businessesError } = await supabase.from("businesses").select("*").order("name");
  if (businessesError) throw new Error(businessesError.message);

  const businesses: RosterBusiness[] = [];
  for (const row of (businessRows ?? []) as BusinessRow[]) {
    let managerEmail: string | null = null;
    let managerSignedIn = false;
    if (row.manager_user_id) {
      const { data: userData } = await serviceClient.auth.admin.getUserById(row.manager_user_id);
      managerEmail = userData?.user?.email ?? null;
      managerSignedIn = Boolean(userData?.user?.last_sign_in_at);
    }
    businesses.push({
      id: row.id,
      name: row.name,
      mode: row.management_mode,
      hasManager: row.manager_user_id != null,
      managerEmail,
      managerSignedIn,
    });
  }

  return { entries, businesses };
});
