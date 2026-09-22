import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * Streams an original file out of the private `member-media` bucket.
 * `member-media` has no anon/public storage policy at all (schema plan,
 * Task 10) -- this route is the only way a browser ever sees its
 * contents, and it does so only after re-implementing, in application
 * code, the exact rule the RLS policy on `media_assets` encodes:
 * `review_status = 'approved'` AND referenced by a published member's
 * logo, cover, or carousel slide. The service-role client bypasses RLS
 * entirely, so this check is the only thing standing between "anyone
 * with an asset id" and every private file in the bucket -- do not relax
 * it without re-deriving it from the RLS policy in
 * docs/superpowers/plans/2026-09-21-member-profiles-schema-rls-storage.md.
 *
 * v1 serves the original file as-is; the crop rectangle is applied in
 * CSS by the caller (src/lib/media/crop.ts), not resized server-side.
 */
async function findEligibleAsset(assetId: string) {
  const supabase = await getSupabaseServiceRoleClient();

  const { data: asset } = await supabase
    .from("media_assets")
    .select("id, storage_path, mime_type, review_status")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset || asset.review_status !== "approved") {
    return null;
  }

  const { data: asLogoOrCover } = await supabase
    .from("members")
    .select("id")
    .or(`logo_asset_id.eq.${assetId},cover_asset_id.eq.${assetId}`)
    .eq("status", "published")
    .maybeSingle();
  if (asLogoOrCover) {
    return asset;
  }

  const { data: slides } = await supabase.from("carousel_slides").select("member_id").eq("asset_id", assetId);
  const memberIds = (slides ?? []).map((slide) => slide.member_id as string);
  if (memberIds.length === 0) {
    return null;
  }

  const { data: publishedMember } = await supabase
    .from("members")
    .select("id")
    .in("id", memberIds)
    .eq("status", "published")
    .maybeSingle();

  return publishedMember ? asset : null;
}

export const Route = createFileRoute("/api/member-media/$assetId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const asset = await findEligibleAsset(params.assetId);
        if (!asset) {
          return new Response("Not found", { status: 404 });
        }

        const supabase = await getSupabaseServiceRoleClient();
        const { data: file, error } = await supabase.storage.from("member-media").download(asset.storage_path);
        if (error || !file) {
          return new Response("Not found", { status: 404 });
        }

        return new Response(file, {
          headers: {
            "Content-Type": asset.mime_type,
            // Public is correct here: eligibility was already re-checked
            // above and this is public marketing content once eligible,
            // not identity-scoped data (see start-core/server-functions
            // skill's Cache-Control warning -- it doesn't apply to this
            // response).
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
