import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import type { MemberRow, MemberType } from "@/lib/supabase/types";
import { geocodeMemberAfterPublish } from "@/lib/geo/geocode.server";

/**
 * The five write-limited columns the schema's own trigger
 * (members_enforce_owner_write_limits) reserves to a Guild admin --
 * status, dues_received_at, approved_at, approved_by_user_id,
 * trail_eligible -- plus member_type, which the task brief also calls out
 * ("correct member_type") as a roster action. One generic patch mutation
 * covers approve, decline, suspend, correct-type, and toggle-trail_eligible
 * alike; the UI decides which fields to send per action.
 */
export type GuildMemberPatch = Partial<
  Pick<MemberRow, "status" | "member_type" | "trail_eligible" | "dues_received_at" | "approved_at" | "approved_by_user_id">
>;

export const updateMemberByGuildAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; patch: GuildMemberPatch }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("members").update(data.patch).eq("id", data.memberId);
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

export const setTrailEligible = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; eligible: boolean }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase
      .from("members")
      .update({ trail_eligible: data.eligible })
      .eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

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
