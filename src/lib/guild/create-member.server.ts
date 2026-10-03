import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { generateUniqueMemberSlug } from "@/lib/guild/unique-member-slug.server";
import type { MemberRow, MemberType } from "@/lib/supabase/types";

export type CreateMemberInput = {
  businessName: string;
  city: string;
  memberType: MemberType;
  contactEmail?: string | null;
};

/**
 * Shared by the roster's "create a new member" action and the inquiries
 * screen's "Set them up as a member" action (task brief, both call sites).
 * New rows start as status = 'draft' (this plan's Decision 8), not the
 * schema's own default of 'applied' -- a roster-created member is, by
 * construction, already past the application stage the spec describes:
 * "the Guild admin creates the member from the roster and sends the
 * invite. The member signs in and gets a draft profile they publish
 * themselves." Guild-admin-only, per the schema's own "members: guild
 * admins can insert" policy -- this function does no separate permission
 * check of its own, since every call site already runs behind the /guild
 * auth guard.
 */
export const createMemberRecord = createServerFn({ method: "POST" })
  .inputValidator((data: CreateMemberInput) => data)
  .handler(async ({ data }): Promise<MemberRow> => {
    const supabase = await getSupabaseServerClientForRequest();
    const slug = await generateUniqueMemberSlug(supabase, data.businessName);

    const { data: member, error } = await supabase
      .from("members")
      .insert({
        slug,
        business_name: data.businessName,
        city: data.city,
        member_type: data.memberType,
        contact_email: data.contactEmail ?? null,
        status: "draft",
      })
      .select("*")
      .single();

    if (error || !member) throw new Error(error?.message ?? "Could not create the member.");
    return member as MemberRow;
  });
