import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import type { MemberRow, MemberType } from "@/lib/supabase/types";
import { geocodeMemberAfterPublish } from "@/lib/geo/geocode.server";

/**
 * The five write-limited columns the schema's own trigger
 * (members_enforce_owner_write_limits) reserves to a Guild admin --
 * status, dues_received_at, approved_at, approved_by_user_id -- plus
 * member_type, which the task brief also calls out ("correct member_type")
 * as a roster action. One generic patch mutation covers approve, decline,
 * suspend and correct-type alike; the UI decides which fields to send per
 * action. trail_eligible is NOT in it: the Trail switch is super admin only
 * (setTrailEligible below, and the members trigger refuses anyone else).
 */
export type GuildMemberPatch = Partial<
  Pick<MemberRow, "status" | "member_type" | "dues_received_at" | "approved_at" | "approved_by_user_id">
>;

const GUILD_MEMBER_PATCH_KEYS: ReadonlyArray<keyof GuildMemberPatch> = [
  "status",
  "member_type",
  "dues_received_at",
  "approved_at",
  "approved_by_user_id",
];

export const updateMemberByGuildAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; patch: GuildMemberPatch }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    // Only the allowed columns -- anything else in the patch is dropped.
    const patch = Object.fromEntries(
      Object.entries(data.patch ?? {}).filter(([key]) =>
        (GUILD_MEMBER_PATCH_KEYS as readonly string[]).includes(key),
      ),
    );
    const { error } = await supabase.from("members").update(patch).eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Approve: publish the profile and stamp who approved it and when. */
export const approveMember = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error("Not signed in.");

    const { error } = await supabase
      .from("members")
      .update({
        status: "published",
        approved_at: new Date().toISOString(),
        approved_by_user_id: userData.user.id,
      })
      .eq("id", data.memberId);
    if (error) throw new Error(error.message);
    // Best-effort map pin for a profile going live without coordinates yet.
    await geocodeMemberAfterPublish(data.memberId, null);
    return { ok: true as const };
  });

export const declineMember = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("members").update({ status: "declined" }).eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const suspendMember = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("members").update({ status: "suspended" }).eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const correctMemberType = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; memberType: MemberType }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("members").update({ member_type: data.memberType }).eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * The roster's Trail switch: super admin only (docs/member-profiles.md,
 * "Super admin"; hidden from Guild admins until the Trail is built). The
 * members trigger refuses the change for anyone else too.
 */
export async function setTrailEligibleCore(
  input: { memberId: string; eligible: boolean },
  supabase: SupabaseClient,
): Promise<{ ok: true }> {
  await requireSuperAdmin(supabase, "change who's on the Trail");
  const { error } = await supabase
    .from("members")
    .update({ trail_eligible: input.eligible === true })
    .eq("id", input.memberId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export const setTrailEligible = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; eligible: boolean }) => data)
  .handler(async ({ data }) => setTrailEligibleCore(data, await getSupabaseServerClientForRequest()));

export const setDuesReceived = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; receivedAt: string | null }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase
      .from("members")
      .update({ dues_received_at: data.receivedAt })
      .eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
