import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import type { MemberRow, MemberType } from "@/lib/supabase/types";

export type BasicsPatch = Partial<
  Pick<
    MemberRow,
    | "business_name"
    | "tagline"
    | "city"
    | "state"
    | "street_address"
    | "service_area"
    | "lead_time"
    | "member_since_year"
    | "timezone"
    | "member_type"
  >
>;

/**
 * One mutation for the whole Basics section, called with only the field(s)
 * the member actually changed (this plan's Decision 6 -- the field-level
 * autosave model). tagline's 70-char cap is enforced here as well as
 * client-side, since the DB check constraint alone would only surface as an
 * opaque Postgres error.
 */
export const updateMemberBasics = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; patch: BasicsPatch }) => data)
  .handler(async ({ data }) => {
    if (typeof data.patch.tagline === "string" && data.patch.tagline.length > 70) {
      throw new Error("Tagline must be 70 characters or fewer.");
    }
    if (
      data.patch.member_type &&
      !(["producer", "mobile", "allied"] as MemberType[]).includes(data.patch.member_type)
    ) {
      throw new Error("Invalid member type.");
    }

    const supabase = await getSupabaseServerClientForRequest();
    const { error } = await supabase.from("members").update(data.patch).eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getMemberBasics = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: member, error } = await supabase
      .from("members")
      .select("*")
      .eq("id", data.memberId)
      .single();
    if (error || !member) throw new Error("Member not found.");
    return member as MemberRow;
  });
