import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { COVER_ASPECT, initialCropForAspect } from "@/lib/media/crop-interaction";
import { assertAssetOwnedByMember } from "@/lib/media/carousel.server";
import { recordAuditLogIfImpersonating } from "@/lib/guild/audit-log.server";
import type { CropRect } from "@/lib/media/crop";
import type { MemberRow } from "@/lib/supabase/types";


/** The subset of MemberRow CoverEditor actually reads -- same narrow-select shape as member-basics.server.ts's BasicsMember/getMemberBasics. */
export type MemberCover = Pick<MemberRow, "id" | "cover_asset_id" | "cover_crop">;

export const getMemberCover = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: member, error } = await supabase
      .from("members")
      .select("id, cover_asset_id, cover_crop")
      .eq("id", data.memberId)
      .single();
    if (error || !member) throw new Error("Member not found.");
    return member as MemberCover;
  });

/**
 * Sets the member's cover photo to a gallery asset and computes its
 * initial centered crop. Members-table write RLS doesn't scope
 * `cover_asset_id` to assets the caller actually owns (same gap
 * carousel.server.ts's assignCarouselSlide documents for
 * carousel_slides.asset_id) -- without assertAssetOwnedByMember below, a
 * member could point their own cover_asset_id at another member's
 * media_assets row, which /api/member-media/$assetId's public
 * eligibility rule ("referenced by a published member") would then make
 * publicly readable, and would display someone else's photo as this
 * member's own cover without their consent. Reusing the shared helper
 * (rather than re-implementing the same check here) keeps this logic in
 * one place for the next caller that needs it (e.g. whatever sets
 * logo_asset_id later in this plan).
 */
export const updateCoverAsset = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { memberId: string; assetId: string; assetWidth: number | null; assetHeight: number | null }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();

    // Must happen before the update below -- see this function's own doc
    // comment and assertAssetOwnedByMember's in carousel.server.ts.
    await assertAssetOwnedByMember(supabase, data.assetId, data.memberId);

    const crop: CropRect =
      data.assetWidth && data.assetHeight
        ? initialCropForAspect(data.assetWidth, data.assetHeight, COVER_ASPECT)
        : { x: 0, y: 0, w: 1, h: 1 };

    // .select("id") + row-count check -- PostgREST reports an RLS-denied
    // update as success with zero rows affected, not as an `error` (same
    // gotcha member-basics.server.ts/hours-editor.server.ts/
    // media-gallery.server.ts/carousel.server.ts all guard against).
    // Without this, a write blocked by RLS would silently report success
    // back to CoverEditor's optimistic UI.
    const { data: updated, error } = await supabase
      .from("members")
      .update({ cover_asset_id: data.assetId, cover_crop: crop })
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

    return { crop };
  });

/**
 * "Remove cover" -- back to the theme-colour band. Clears the crop too, so
 * a stale rectangle can't be applied to whatever cover is chosen next.
 * Same shape as social-image.server.ts's clearSocialImageAsset.
 */
export const clearCoverAsset = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: updated, error } = await supabase
      .from("members")
      .update({ cover_asset_id: null, cover_crop: null })
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

export const updateCoverCrop = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; crop: CropRect }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: updated, error } = await supabase
      .from("members")
      .update({ cover_crop: data.crop })
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
