import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { assertAssetOwnedByMember } from "@/lib/media/carousel.server";
import { recordAuditLogIfImpersonating } from "@/lib/guild/audit-log.server";
import type { MemberRow } from "@/lib/supabase/types";

/**
 * The subset of MemberRow SocialImageEditor actually reads -- same narrow
 * select shape as cover.server.ts's MemberCover. member_type is included
 * (not just id/og_image_asset_id) so the editor can show which type
 * placeholder is currently in effect, without a second loader call.
 */
export type MemberSocialImage = Pick<MemberRow, "id" | "og_image_asset_id" | "member_type">;

export const getMemberSocialImage = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: member, error } = await supabase
      .from("members")
      .select("id, og_image_asset_id, member_type")
      .eq("id", data.memberId)
      .single();
    if (error || !member) throw new Error("Member not found.");
    return member as MemberSocialImage;
  });

/**
 * Sets the member's social sharing image to a gallery asset. No crop is
 * stored here, unlike updateCoverAsset -- social platforms fetch this file
 * directly and never apply a crop rectangle to it, so there is nothing
 * useful to compute or save.
 */
export const updateSocialImageAsset = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; assetId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();

    // Must happen before the update below -- see cover.server.ts's
    // updateCoverAsset, which documents why (assertAssetOwnedByMember's
    // own doc comment in carousel.server.ts has the full story).
    await assertAssetOwnedByMember(supabase, data.assetId, data.memberId);

    // .select("id") + row-count check -- PostgREST reports an RLS-denied
    // update as success with zero rows affected, not as an `error` (same
    // gotcha every other member-mutation file in this codebase guards
    // against).
    const { data: updated, error } = await supabase
      .from("members")
      .update({ og_image_asset_id: data.assetId })
      .eq("id", data.memberId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Save failed — you may not have permission to edit this member.");
    }

    await recordAuditLogIfImpersonating({
      memberId: data.memberId,
      tableName: "members",
      rowId: data.memberId,
      action: "update",
    });

    return { ok: true as const };
  });

export const clearSocialImageAsset = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: updated, error } = await supabase
      .from("members")
      .update({ og_image_asset_id: null })
      .eq("id", data.memberId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Save failed — you may not have permission to edit this member.");
    }

    await recordAuditLogIfImpersonating({
      memberId: data.memberId,
      tableName: "members",
      rowId: data.memberId,
      action: "update",
    });

    return { ok: true as const };
  });
