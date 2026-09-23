import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { createMemberRecord } from "@/lib/guild/create-member.server";
import type { InquiryRow, MemberType } from "@/lib/supabase/types";

export type InquiryFilter = "open" | "handled" | "all";

/** Open / Handled / All — artboard N's own filter set, no "read" state (spec, "inquiries" table notes). */
export const getInquiries = createServerFn({ method: "GET" })
  .inputValidator((data: { filter: InquiryFilter }) => data)
  .handler(async ({ data }): Promise<InquiryRow[]> => {
    const supabase = await getSupabaseServerClientForRequest();
    let query = supabase.from("inquiries").select("*").order("created_at", { ascending: false });
    if (data.filter !== "all") {
      query = query.eq("status", data.filter);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as InquiryRow[];
  });

export const markInquiryHandled = createServerFn({ method: "POST" })
  .inputValidator((data: { inquiryId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error("Not signed in.");

    const { error } = await supabase
      .from("inquiries")
      .update({ status: "handled", handled_by_user_id: userData.user.id, handled_at: new Date().toISOString() })
      .eq("id", data.inquiryId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * "Set them up as a member" (task brief): creates a members row via the
 * same createMemberRecord() the roster's own "create a new member" action
 * uses, sets inquiries.converted_member_id, and pre-fills the new member's
 * business_name/contact_email from the inquiry's name/email -- there's no
 * other business-identifying data on an inquiry row to draw from, and this
 * plan doesn't invent a mapping the schema doesn't support. city and
 * member_type have no equivalent on an inquiry at all, so this action asks
 * for them explicitly rather than guessing.
 */
export const setUpInquiryAsMember = createServerFn({ method: "POST" })
  .inputValidator((data: { inquiryId: string; city: string; memberType: MemberType }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: inquiry, error: inquiryError } = await supabase
      .from("inquiries")
      .select("*")
      .eq("id", data.inquiryId)
      .single();
    if (inquiryError || !inquiry) throw new Error(inquiryError?.message ?? "Inquiry not found.");
    const typedInquiry = inquiry as InquiryRow;

    const member = await createMemberRecord({
      data: {
        businessName: typedInquiry.name,
        city: data.city,
        memberType: data.memberType,
        contactEmail: typedInquiry.email,
      },
    });

    const { error: updateError } = await supabase
      .from("inquiries")
      .update({ converted_member_id: member.id })
      .eq("id", data.inquiryId);
    if (updateError) throw new Error(updateError.message);

    return { ok: true as const, member };
  });
