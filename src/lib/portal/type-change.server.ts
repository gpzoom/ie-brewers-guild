import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { requirePortalMember } from "@/lib/portal/portal-session.server";
import { sendTransactionalEmail } from "@/lib/email/send";
import type { MemberType } from "@/lib/supabase/types";

/**
 * Portal Basics' "Request a type change" (docs/member-profiles.md, "Member
 * type: confirm once, then locked"). Once confirmed, the type is locked for
 * the member, so this files a support_requests row (kind type_change) and
 * emails the Guild, who make the change from the roster.
 *
 * The member comes from the session (requirePortalMember), never the
 * browser. Owner and full editor only -- a Guild admin editing as them has
 * owner rights. The insert goes through the signed-in session client, so
 * the RLS policy on support_requests checks the role again and pins
 * requested_by_user_id to the caller.
 */

const MEMBER_TYPES: readonly MemberType[] = ["producer", "mobile", "allied"];
export const TYPE_CHANGE_NOTE_MAX = 1000;

export type TypeChangeRequestSummary = {
  requestedType: MemberType;
  createdAt: string;
};

export const requestTypeChange = createServerFn({ method: "POST" })
  .inputValidator((data: { memberType: MemberType; note?: string }) => {
    if (!MEMBER_TYPES.includes(data?.memberType)) throw new Error("Choose a member type.");
    const note = typeof data.note === "string" ? data.note.trim() : "";
    if (note.length > TYPE_CHANGE_NOTE_MAX) {
      throw new Error(`Keep the note under ${TYPE_CHANGE_NOTE_MAX} characters.`);
    }
    return { memberType: data.memberType, note: note || null };
  })
  .handler(async ({ data }): Promise<TypeChangeRequestSummary> => {
    const member = await requirePortalMember();
    if (member.role === "media_events") {
      throw new Error("Only the profile's owner or a full editor can ask for a type change.");
    }
    const supabase = await getSupabaseServerClientForRequest();

    const { data: row, error: memberError } = await supabase
      .from("members")
      .select("member_type, type_confirmed_at")
      .eq("id", member.memberId)
      .single();
    if (memberError || !row) throw new Error("Couldn't find your profile — try again.");
    const currentType = row.member_type as MemberType;
    if (data.memberType === currentType) throw new Error("That's already your member type.");

    const { data: open } = await supabase
      .from("support_requests")
      .select("id")
      .eq("member_id", member.memberId)
      .eq("kind", "type_change")
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    if (open) throw new Error("You already have a request waiting. The Guild will be in touch.");

    const { data: inserted, error } = await supabase
      .from("support_requests")
      .insert({
        member_id: member.memberId,
        requested_by_user_id: member.userId,
        kind: "type_change",
        requested_member_type: data.memberType,
        note: data.note,
      })
      .select("requested_member_type, created_at")
      .single();
    if (error || !inserted) {
      throw new Error("Couldn't send your request — try again.");
    }

    let requestedByEmail: string | null = null;
    if (!member.isImpersonating) {
      const { data: userData } = await supabase.auth.getUser();
      requestedByEmail = userData?.user?.email ?? null;
    }
    try {
      await sendTransactionalEmail({
        trigger: "type_change_requested",
        memberId: member.memberId,
        memberName: member.memberName,
        currentType,
        requestedType: data.memberType,
        note: data.note,
        requestedByEmail,
      });
    } catch (err) {
      // The request is saved and shows on the Guild's Inquiries screen
      // either way; a failed email must not undo it.
      console.error("requestTypeChange: couldn't email the Guild", err);
    }

    return {
      requestedType: inserted.requested_member_type as MemberType,
      createdAt: inserted.created_at as string,
    };
  });
