import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import type { MediaAssetRow } from "@/lib/supabase/types";

export const listPendingMedia = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: assets, error } = await supabase
      .from("media_assets")
      .select("*")
      .eq("member_id", data.memberId)
      .eq("review_status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return assets as MediaAssetRow[];
  });

export const approvePendingMedia = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    // .select("id") + row-count check -- PostgREST reports an RLS-denied
    // update as success with zero rows affected, not as an `error` (same
    // gotcha member-basics.server.ts/hours-editor.server.ts/
    // media-gallery.server.ts/carousel.server.ts/cover.server.ts/
    // upload-tokens.server.ts all guard against). Without this, a write
    // blocked by RLS (e.g. someone else's pending asset id) would silently
    // report success back to ReviewTray's optimistic UI.
    const { data: updated, error } = await supabase
      .from("media_assets")
      .update({ review_status: "approved" })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Approve failed — you may not have permission to review this photo.");
    }
    return { ok: true as const };
  });

/** Kept as a row (review_status: "rejected"), not deleted -- preserves the permission-acceptance record. */
export const rejectPendingMedia = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    // Same row-count guard as approvePendingMedia above -- see its
    // comment for why this matters.
    const { data: updated, error } = await supabase
      .from("media_assets")
      .update({ review_status: "rejected" })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Reject failed — you may not have permission to review this photo.");
    }
    return { ok: true as const };
  });
