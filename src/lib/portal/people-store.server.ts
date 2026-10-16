import type { SupabaseClient } from "@supabase/supabase-js";
import { isPortalRole } from "@/lib/portal/portal-destination";
import { isOpenInviteRole, type InviteRecord, type PeopleStore } from "@/lib/portal/people";

/**
 * The People section's store on Supabase. It takes the SERVICE-ROLE client
 * (member_invites has no client access at all, and only Guild admins may
 * write member_users under RLS), so it must only ever be built AFTER the
 * caller's owner check -- portal-people.server.ts and portal-shell.server.ts
 * both resolve the member from the session and check the role first.
 * Every query is scoped to the member id it's given.
 */

type InviteRow = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

function toInvite(row: InviteRow): InviteRecord | null {
  if (!isOpenInviteRole(row.role)) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function supabasePeopleStore(service: SupabaseClient): PeopleStore {
  return {
    async businessFor(memberId) {
      const { data, error } = await service
        .from("members")
        .select("city, business_id, businesses(name, management_mode, manager_user_id)")
        .eq("id", memberId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      type BusinessRow = { name: string; management_mode: string; manager_user_id: string | null };
      const row = data as {
        city: string;
        business_id: string | null;
        businesses: BusinessRow | BusinessRow[] | null;
      } | null;
      const business = Array.isArray(row?.businesses) ? row?.businesses[0] : row?.businesses;
      if (!row?.business_id || !business || business.management_mode !== "one_manager") return null;
      const { count, error: countError } = await service
        .from("members")
        .select("id", { count: "exact", head: true })
        .eq("business_id", row.business_id);
      if (countError) throw new Error(countError.message);
      return {
        name: business.name,
        city: row.city,
        locationCount: count ?? 0,
        managerUserId: business.manager_user_id,
      };
    },

    async listMemberUsers(memberId) {
      const { data, error } = await service
        .from("member_users")
        .select("user_id, role, created_at")
        .eq("member_id", memberId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).flatMap((row) =>
        isPortalRole(row.role)
          ? [{ userId: row.user_id as string, role: row.role, createdAt: row.created_at as string }]
          : [],
      );
    },

    async userEmail(userId) {
      const { data } = await service.auth.admin.getUserById(userId);
      return data?.user?.email ?? null;
    },

    async listOpenInvites(memberId) {
      const { data, error } = await service
        .from("member_invites")
        .select("id, email, role, expires_at, created_at, updated_at")
        .eq("member_id", memberId)
        .is("accepted_at", null)
        .is("cancelled_at", null);
      if (error) throw new Error(error.message);
      return ((data ?? []) as InviteRow[]).flatMap((row) => {
        const invite = toInvite(row);
        return invite ? [invite] : [];
      });
    },

    async insertInvite(row) {
      const { data, error } = await service
        .from("member_invites")
        .insert({
          member_id: row.memberId,
          email: row.email,
          role: row.role,
          invited_by_user_id: row.invitedByUserId,
          expires_at: row.expiresAt,
        })
        .select("id, email, role, expires_at, created_at, updated_at")
        .single();
      if (error || !data) {
        // The one-open-invite-per-address index: someone else invited the
        // same address a moment ago.
        if (error?.code === "23505") throw new Error("That address already has an invite waiting.");
        throw new Error(error?.message ?? "Couldn't save the invite.");
      }
      const invite = toInvite(data as InviteRow);
      if (!invite) throw new Error("Couldn't save the invite.");
      return invite;
    },

    async updateInvite(memberId, inviteId, patch) {
      const values: Record<string, string> = {};
      if (patch.role) values.role = patch.role;
      if (patch.expiresAt) values.expires_at = patch.expiresAt;
      if (patch.cancelledAt) values.cancelled_at = patch.cancelledAt;
      if (patch.invitedByUserId) values.invited_by_user_id = patch.invitedByUserId;
      const { error } = await service
        .from("member_invites")
        .update(values)
        .eq("id", inviteId)
        .eq("member_id", memberId)
        .is("accepted_at", null)
        .is("cancelled_at", null);
      if (error) throw new Error(error.message);
    },

    async deleteMemberUser(memberId, userId) {
      const { error } = await service
        .from("member_users")
        .delete()
        .eq("member_id", memberId)
        .eq("user_id", userId)
        .neq("role", "owner");
      if (error) throw new Error(error.message);
    },
  };
}
