import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import {
  getSupabaseServerClientForRequest,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { withSuperAdmin } from "@/lib/auth/super-admin";
import { sendTransactionalEmail } from "@/lib/email/send";
import {
  acceptGuildAdminInvites,
  cancelGuildAdminInvite,
  inviteGuildAdmin,
  loadGuildAdmins,
  removeGuildAdmin,
  resendGuildAdminInvite,
  type GuildAdminInviteRecord,
  type GuildAdminStore,
  type GuildAdminsView,
} from "@/lib/guild/guild-admins";

/**
 * The Guild admins screen's server side (docs/member-profiles.md, "Super
 * admin" > "Guild admins screen" and "Enforcement"). Every action checks
 * the signed-in person is the super admin on the SESSION client first;
 * only then is the service-role store built -- guild_admin_invites has no
 * client access, and only the service role may change profiles.
 */

type InviteRow = {
  id: string;
  email: string;
  expires_at: string;
  updated_at: string;
  invited_by_user_id: string | null;
};

function toInvite(row: InviteRow): GuildAdminInviteRecord {
  return {
    id: row.id,
    email: row.email,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
    invitedByUserId: row.invited_by_user_id,
  };
}

const INVITE_COLUMNS = "id, email, expires_at, updated_at, invited_by_user_id";

function supabaseGuildAdminStore(service: SupabaseClient): GuildAdminStore {
  return {
    async listAdmins() {
      const { data, error } = await service
        .from("profiles")
        .select("id, is_guild_admin, is_super_admin, updated_at")
        .or("is_guild_admin.eq.true,is_super_admin.eq.true");
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        userId: row.id as string,
        isSuperAdmin: row.is_super_admin === true,
        addedAt: row.updated_at as string,
      }));
    },

    async account(userId) {
      const { data } = await service.auth.admin.getUserById(userId);
      return {
        email: data?.user?.email ?? null,
        lastSignInAt: data?.user?.last_sign_in_at ?? null,
      };
    },

    async findUserIdByEmail(email) {
      for (let page = 1; ; page += 1) {
        const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw new Error(error.message);
        const match = data.users.find((u) => u.email?.toLowerCase() === email);
        if (match) return match.id;
        if (data.users.length < 200) return null;
      }
    },

    async isGuildAdmin(userId) {
      const { data } = await service
        .from("profiles")
        .select("is_guild_admin, is_super_admin")
        .eq("id", userId)
        .maybeSingle();
      const row = data as { is_guild_admin?: boolean; is_super_admin?: boolean } | null;
      return {
        isGuildAdmin: row?.is_guild_admin === true || row?.is_super_admin === true,
        isSuperAdmin: row?.is_super_admin === true,
      };
    },

    async setGuildAdmin(userId, value) {
      const { error } = await service
        .from("profiles")
        .upsert({ id: userId, is_guild_admin: value }, { onConflict: "id" });
      if (error) throw new Error(error.message);
    },

    async listOpenInvites() {
      const { data, error } = await service
        .from("guild_admin_invites")
        .select(INVITE_COLUMNS)
        .is("accepted_at", null)
        .is("cancelled_at", null);
      if (error) throw new Error(error.message);
      return ((data ?? []) as InviteRow[]).map(toInvite);
    },

    async insertInvite(row) {
      const { data, error } = await service
        .from("guild_admin_invites")
        .insert({
          email: row.email,
          invited_by_user_id: row.invitedByUserId,
          expires_at: row.expiresAt,
        })
        .select(INVITE_COLUMNS)
        .single();
      if (error?.code === "23505") throw new Error("That address already has an invite waiting.");
      if (error || !data) throw new Error(error?.message ?? "Couldn't save the invite.");
      return toInvite(data as InviteRow);
    },

    async updateInvite(id, patch) {
      const values: Record<string, string> = {};
      if (patch.expiresAt) values.expires_at = patch.expiresAt;
      if (patch.cancelledAt) values.cancelled_at = patch.cancelledAt;
      if (patch.acceptedAt) values.accepted_at = patch.acceptedAt;
      if (patch.acceptedUserId) values.accepted_user_id = patch.acceptedUserId;
      if (patch.invitedByUserId) values.invited_by_user_id = patch.invitedByUserId;
      const { error } = await service
        .from("guild_admin_invites")
        .update(values)
        .eq("id", id)
        .is("accepted_at", null)
        .is("cancelled_at", null);
      if (error) throw new Error(error.message);
    },

    async audit(entry) {
      const { error } = await service.from("audit_log").insert({
        actor_user_id: entry.actorUserId,
        member_id: null,
        table_name: entry.tableName,
        row_id: entry.rowId,
        action: entry.action,
        details: entry.details,
      });
      // The change itself already happened; a logging failure is reported,
      // never undone.
      if (error) console.error("Guild admins: couldn't write the audit row", error);
    },
  };
}

/** The super admin check, then the service-role store (in that order). */
async function superAdminStore(sessionClient: SupabaseClient, action: string) {
  const { actor, value: store } = await withSuperAdmin(sessionClient, action, async () =>
    supabaseGuildAdminStore(await getSupabaseServiceRoleClient()),
  );
  return { actor, store };
}

/**
 * The invitee needs an account the sign-in link can use; created here if
 * they don't have one yet (the same way the Guild's member invite does).
 * Being signed up grants nothing -- access comes when they accept.
 */
async function ensureAccount(email: string): Promise<void> {
  const service = await getSupabaseServiceRoleClient();
  const existing = await supabaseGuildAdminStore(service).findUserIdByEmail(email);
  if (existing) return;
  const { error } = await service.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw new Error(error.message);
}

async function emailInvite(email: string, inviterEmail: string | null): Promise<boolean> {
  try {
    await sendTransactionalEmail({ trigger: "guild_admin_invited", email, inviterEmail });
    return true;
  } catch (err) {
    console.error("Guild admins: couldn't send the invite email", err);
    return false;
  }
}

export const getGuildAdmins = createServerFn({ method: "GET" }).handler(
  async (): Promise<GuildAdminsView> => {
    const { actor, store } = await superAdminStore(
      await getSupabaseServerClientForRequest(),
      "see who's a Guild admin",
    );
    return loadGuildAdmins(store, actor.userId);
  },
);

export const inviteGuildAdminFn = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string }) => ({ email: data?.email }))
  .handler(async ({ data }) => {
    const { actor, store } = await superAdminStore(
      await getSupabaseServerClientForRequest(),
      "invite a Guild admin",
    );
    const invite = await inviteGuildAdmin(store, { email: data.email, actorUserId: actor.userId });
    await ensureAccount(invite.email);
    const emailSent = await emailInvite(invite.email, actor.email);
    return { email: invite.email, refreshed: invite.refreshed, emailSent };
  });

export const resendGuildAdminInviteFn = createServerFn({ method: "POST" })
  .inputValidator((data: { inviteId: string }) => ({ inviteId: data?.inviteId }))
  .handler(async ({ data }) => {
    const { actor, store } = await superAdminStore(
      await getSupabaseServerClientForRequest(),
      "resend a Guild admin invite",
    );
    const invite = await resendGuildAdminInvite(store, {
      inviteId: data.inviteId,
      actorUserId: actor.userId,
    });
    await ensureAccount(invite.email);
    const emailSent = await emailInvite(invite.email, actor.email);
    return { email: invite.email, emailSent };
  });

export const cancelGuildAdminInviteFn = createServerFn({ method: "POST" })
  .inputValidator((data: { inviteId: string }) => ({ inviteId: data?.inviteId }))
  .handler(async ({ data }) => {
    const { actor, store } = await superAdminStore(
      await getSupabaseServerClientForRequest(),
      "cancel a Guild admin invite",
    );
    await cancelGuildAdminInvite(store, { inviteId: data.inviteId, actorUserId: actor.userId });
    return { ok: true as const };
  });

export const removeGuildAdminFn = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: string }) => ({ userId: data?.userId }))
  .handler(async ({ data }) => {
    const { actor, store } = await superAdminStore(
      await getSupabaseServerClientForRequest(),
      "remove a Guild admin",
    );
    await removeGuildAdmin(store, { userId: data.userId, actorUserId: actor.userId });
    return { ok: true as const };
  });

/**
 * Sign-in callback: accepts the signed-in person's own Guild admin invite.
 * `user` is the freshly verified session user. Never throws -- a failure
 * here must not stop someone signing in; they can sign in again.
 */
export const acceptGuildAdminInvitesAtSignIn = createServerOnlyFn(
  async (user: { id: string; email: string | null | undefined }): Promise<void> => {
    try {
      const store = supabaseGuildAdminStore(await getSupabaseServiceRoleClient());
      await acceptGuildAdminInvites(store, user);
    } catch (err) {
      console.error("acceptGuildAdminInvitesAtSignIn failed", err);
    }
  },
);
