import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { clearImpersonationCookie, readImpersonationState } from "@/lib/guild/impersonation.server";

/** Both buckets store a member's files under `{member_id}/...`. */
export const MEMBER_STORAGE_BUCKETS = ["member-media", "member-logos"] as const;

const STORAGE_PAGE_SIZE = 100;
const STORAGE_REMOVE_BATCH = 100;

/**
 * Recursively lists every object path under `prefix` in one bucket.
 * Supabase storage's list() only returns ONE level: sub-folders come back
 * as entries with a null id, so we recurse into them, and each level is
 * paged with limit/offset until a short page signals the end.
 */
async function listAllObjectPaths(serviceClient: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
    const { data, error } = await serviceClient.storage.from(bucket).list(prefix, {
      limit: STORAGE_PAGE_SIZE,
      offset,
    });
    if (error) throw new Error(error.message);
    const entries = data ?? [];
    for (const entry of entries) {
      const fullPath = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        paths.push(...(await listAllObjectPaths(serviceClient, bucket, fullPath)));
      } else {
        paths.push(fullPath);
      }
    }
    if (entries.length < STORAGE_PAGE_SIZE) break;
  }
  return paths;
}

async function removeMemberStorage(serviceClient: SupabaseClient, memberId: string): Promise<void> {
  for (const bucket of MEMBER_STORAGE_BUCKETS) {
    try {
      const paths = await listAllObjectPaths(serviceClient, bucket, memberId);
      for (let i = 0; i < paths.length; i += STORAGE_REMOVE_BATCH) {
        const batch = paths.slice(i, i + STORAGE_REMOVE_BATCH);
        const { error } = await serviceClient.storage.from(bucket).remove(batch);
        if (error) console.error(`deleteMember: failed to remove files from ${bucket}`, error);
      }
    } catch (err) {
      console.error(`deleteMember: failed to clean up storage bucket ${bucket} for member ${memberId}`, err);
    }
  }
}

/**
 * Deletes the sign-in accounts that belonged ONLY to the deleted member.
 * Skips anyone who is a Guild admin (never lock an admin out by deleting a
 * business they happened to own) and anyone still linked to another member
 * through member_users (their account still has a job to do). If either
 * check can't be answered, the user is left alone -- a leftover account is
 * harmless, a wrongly-deleted one is not.
 */
async function deleteOrphanedAuthUsers(serviceClient: SupabaseClient, userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    try {
      const { data: profile, error: profileError } = await serviceClient
        .from("profiles")
        .select("is_guild_admin")
        .eq("id", userId)
        .maybeSingle();
      if (profileError) throw new Error(profileError.message);
      if (profile?.is_guild_admin) continue;

      const { data: otherLinks, error: linksError } = await serviceClient
        .from("member_users")
        .select("member_id")
        .eq("user_id", userId)
        .limit(1);
      if (linksError) throw new Error(linksError.message);
      if ((otherLinks ?? []).length > 0) continue;

      const { error } = await serviceClient.auth.admin.deleteUser(userId);
      if (error) throw new Error(error.message);
    } catch (err) {
      console.error(`deleteMember: failed to delete auth user ${userId}`, err);
    }
  }
}

/**
 * Permanently deletes a member and everything hanging off it.
 *
 * The is_guild_admin check runs via the per-request session client BEFORE
 * the service-role client is touched (same reasoning as inviteMember: the
 * createServerFn below is an independently network-reachable endpoint).
 *
 * DB order matters:
 *  - audit_log.member_id and inquiries.converted_member_id have no ON DELETE
 *    clause (they'd block the delete), so they're set to null first --
 *    history is kept, it just no longer points at a member.
 *  - carousel_slides.asset_id -> media_assets is ON DELETE RESTRICT; when the
 *    member delete cascades into both tables at once that can conflict, so
 *    the member's slides are deleted explicitly first.
 *  - everything else FK'd to members cascades.
 * These steps aren't one transaction (supabase-js has none); each is safe
 * to repeat, so a failed delete can simply be retried.
 *
 * Storage and auth-user cleanup run AFTER the member row is gone and are
 * best-effort: failures are logged, never thrown, since the member is
 * already deleted by then.
 */
export async function deleteMemberCore(
  memberId: string,
  sessionClient: SupabaseClient,
  serviceClient: SupabaseClient,
): Promise<{ ok: true }> {
  const { data: userData } = await sessionClient.auth.getUser();
  if (!userData?.user) throw new Error("Not signed in.");

  const { data: profile } = await sessionClient
    .from("profiles")
    .select("is_guild_admin")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!profile?.is_guild_admin) {
    throw new Error("Only a Guild admin can delete a member.");
  }

  // Collected before anything is deleted -- the member delete cascades
  // these member_users rows away.
  const { data: links, error: linksError } = await serviceClient
    .from("member_users")
    .select("user_id")
    .eq("member_id", memberId);
  if (linksError) throw new Error(linksError.message);
  const userIds = [...new Set((links ?? []).map((row: { user_id: string }) => row.user_id))];

  const { error: auditError } = await serviceClient
    .from("audit_log")
    .update({ member_id: null })
    .eq("member_id", memberId);
  if (auditError) throw new Error(auditError.message);

  // Record the delete itself. Written AFTER the member_id nulling above
  // (so that step can't null it) and with member_id null (the member row is
  // about to go, and audit_log.member_id has no ON DELETE clause). row_id
  // keeps which member it was. audit_log has no free-text column, so the
  // business name can't be stored here. If this fails nothing has been
  // deleted yet -- abort rather than delete without a trail.
  const { error: auditInsertError } = await serviceClient.from("audit_log").insert({
    actor_user_id: userData.user.id,
    member_id: null,
    table_name: "members",
    row_id: memberId,
    action: "delete",
  });
  if (auditInsertError) throw new Error(auditInsertError.message);

  const { error: inquiriesError } = await serviceClient
    .from("inquiries")
    .update({ converted_member_id: null })
    .eq("converted_member_id", memberId);
  if (inquiriesError) throw new Error(inquiriesError.message);

  const { error: slidesError } = await serviceClient.from("carousel_slides").delete().eq("member_id", memberId);
  if (slidesError) throw new Error(slidesError.message);

  const { data: deleted, error: deleteError } = await serviceClient
    .from("members")
    .delete()
    .eq("id", memberId)
    .select("id");
  if (deleteError) throw new Error(deleteError.message);
  if ((deleted ?? []).length !== 1) {
    throw new Error("That member could not be found — it may already have been deleted.");
  }

  await removeMemberStorage(serviceClient, memberId);
  await deleteOrphanedAuthUsers(serviceClient, userIds);

  return { ok: true };
}

export const deleteMember = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const sessionClient = await getSupabaseServerClientForRequest();
    // deleteMemberCore checks is_guild_admin on the session client before
    // using this one; creating the client object itself does no I/O.
    const serviceClient = await getSupabaseServiceRoleClient();
    const result = await deleteMemberCore(data.memberId, sessionClient, serviceClient);
    // Deleting the member you're currently editing as would leave the
    // impersonation cookie pointing at a deleted id, breaking /admin.
    const impersonation = await readImpersonationState();
    if (impersonation?.memberId === data.memberId) clearImpersonationCookie();
    return result;
  });
