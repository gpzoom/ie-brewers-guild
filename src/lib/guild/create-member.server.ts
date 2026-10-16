import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { generateUniqueMemberSlug } from "@/lib/guild/unique-member-slug.server";
import { applyMemberBusiness } from "@/lib/guild/businesses.server";
import { runPartOfStep } from "@/lib/guild/member-part-of";
import type { MemberRow, MemberType } from "@/lib/supabase/types";

export type CreateMemberInput = {
  businessName: string;
  city: string;
  memberType: MemberType;
  contactEmail?: string | null;
  /**
   * Add member's "Part of" (spec 2026-10-15): undefined leaves it to the
   * database's same-name rule, null is "None -- a single location", a
   * string is a business id. Joining a one-manager business this way links
   * the location and emails the manager.
   */
  partOf?: string | null;
};

/**
 * `partOfError` is set when the member was created but its Part of was
 * refused -- the add itself succeeded, so callers must not retry it.
 */
export type CreateMemberResult = { member: MemberRow; partOfError: string | null };

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
  .handler(async ({ data }): Promise<CreateMemberResult> => {
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

    // From here on the member exists: nothing below may throw, or a retry
    // would create it a second time.
    const created = member as MemberRow;
    const partOfError = await runPartOfStep(
      (target) => applyMemberBusiness(supabase, created.id, target),
      created.business_id ?? null,
      data.partOf,
    );

    // Re-read so the returned row has its final business_id.
    const { data: final } = await supabase
      .from("members")
      .select("*")
      .eq("id", created.id)
      .maybeSingle();
    return { member: (final as MemberRow | null) ?? created, partOfError };
  });
