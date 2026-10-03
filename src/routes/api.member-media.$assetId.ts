import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

// media_assets.kind is check-constrained to (image, video) -- this is the
// raster/video allowlist for what this route will echo back as its real
// Content-Type. image/svg+xml is deliberately excluded: the spec permits
// SVG uploads (for logos, served through the separate public
// member-logos bucket, never through this route) and an SVG is active
// content -- a same-origin response with Content-Type: image/svg+xml can
// be directly navigated to and executed, and X-Content-Type-Options:
// nosniff does not protect against that (it only stops the browser from
// overriding a *different* declared type). Anything not in this list,
// including svg, is served as application/octet-stream instead, which
// browsers download rather than render/execute.
const ALLOWED_MEDIA_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

/**
 * Streams an original file out of the private `member-media` bucket.
 * `member-media` has no anon/public storage policy at all (schema plan,
 * Task 10) -- this route is the only way a browser ever sees its
 * contents, and it does so only after re-implementing, in application
 * code, the exact rule the RLS policy on `media_assets` encodes:
 * `review_status = 'approved'` AND referenced by a published member's
 * logo, cover, social sharing image, or carousel slide. The service-role client bypasses RLS
 * entirely, so this check is the only thing standing between "anyone
 * with an asset id" and every private file in the bucket -- do not relax
 * it without re-deriving it from the RLS policy in
 * docs/superpowers/plans/2026-09-21-member-profiles-schema-rls-storage.md.
 *
 * v1 serves the original file as-is; the crop rectangle is applied in
 * CSS by the caller (src/lib/media/crop.ts), not resized server-side.
 */
async function findEligibleAsset(assetId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assetId)) return null;

  const supabase = await getSupabaseServiceRoleClient();

  const { data: asset } = await supabase
    .from("media_assets")
    .select("id, storage_path, mime_type, review_status")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset || asset.review_status !== "approved") {
    return null;
  }

  const { data: asLogoOrCoverOrSocialImage } = await supabase
    .from("members")
    .select("id")
    .or(`logo_asset_id.eq.${assetId},cover_asset_id.eq.${assetId},og_image_asset_id.eq.${assetId}`)
    .eq("status", "published")
    .limit(1)
    .maybeSingle();
  if (asLogoOrCoverOrSocialImage) {
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
    .limit(1)
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
            "Content-Type": ALLOWED_MEDIA_MIME_TYPES.has(asset.mime_type)
              ? asset.mime_type
              : "application/octet-stream",
            // Public is correct here: eligibility was already re-checked
            // above and this is public marketing content once eligible,
            // not identity-scoped data (see start-core/server-functions
            // skill's Cache-Control warning -- it doesn't apply to this
            // response).
            "Cache-Control": "public, max-age=3600",
            // asset.mime_type is app-written (set at upload time), not
            // browser-sniffed -- still, this is user-supplied content, so
            // block MIME sniffing to stop a mislabeled/crafted file from
            // being interpreted as something more dangerous than its
            // declared type (e.g. HTML/script) by the browser.
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
