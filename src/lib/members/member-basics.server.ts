import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { recordAuditLogIfImpersonating } from "@/lib/guild/audit-log.server";
import type { MemberRow, MemberType } from "@/lib/supabase/types";

/**
 * Live reads and the one remaining live write for Basics.
 *
 * Phase 2: every Basics field now saves to the member's draft
 * (src/lib/drafts/drafts.server.ts, saveDraftSection with section
 * "basics") and goes live only when published. The exception is member
 * type, which isn't drafted (spec, "What is not drafted"): until the
 * portal's confirm-once wizard step and "Request a type change" replace
 * it, an owner or full editor can still change an UNCONFIRMED type here,
 * live. The database allows a member exactly this one column on the live
 * row (members_enforce_owner_write_limits,
 * 20260925210100_lock_live_profile_writes.sql) and refuses it once
 * type_confirmed_at is set.
 */
export const updateMemberType = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; memberType: MemberType }) => data)
  .handler(async ({ data }) => {
    if (!(["producer", "mobile", "allied"] as unknown[]).includes(data.memberType)) {
      throw new Error("Invalid member type.");
    }
    const supabase = await getSupabaseServerClientForRequest();
    // .select("id") + row-count check -- PostgREST reports an RLS-denied
    // update as success with zero rows affected, not as an `error`.
    const { data: updated, error } = await supabase
      .from("members")
      .update({ member_type: data.memberType })
      .eq("id", data.memberId)
      .select("id");
    if (error) {
      throw new Error(
        error.message.includes("locked once confirmed")
          ? "Your member type is set by the Guild. Ask the Guild to change it."
          : error.message,
      );
    }
    if (!updated || updated.length === 0) {
      throw new Error("Save failed — you may not have permission to change the member type.");
    }

    await recordAuditLogIfImpersonating({
      memberId: data.memberId,
      tableName: "members",
      rowId: data.memberId,
      action: "update",
    });

    return { ok: true as const };
  });

/**
 * A read-only slice of the LIVE member row, for screens that need a live
 * fact rather than the draft (the Events page shows event times in the
 * member's live timezone -- events themselves aren't drafted).
 */
export type BasicsMember = Pick<MemberRow, "id" | "business_name" | "timezone" | "member_type">;

export const getMemberBasics = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: member, error } = await supabase
      .from("members")
      .select("id, business_name, timezone, member_type")
      .eq("id", data.memberId)
      .single();
    if (error || !member) throw new Error("Member not found.");
    return member as BasicsMember;
  });
