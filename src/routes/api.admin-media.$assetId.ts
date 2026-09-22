import { createFileRoute } from "@tanstack/react-router";
import { requireMemberSession } from "@/lib/auth/require-member-session.server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

// Mirrors api.member-media.$assetId.ts's own raster/video allowlist (kept
// as a separate copy rather than a shared import, since that route is
// explicitly off-limits to modify for this task -- see this route's own
// doc comment below for why the allowlist and its SVG exclusion exist).
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
 * Streams an original file out of the private `member-media` bucket for
 * the MEMBER'S OWN admin panel -- the counterpart to
 * api.member-media.$assetId.ts, not a replacement for it.
 *
 * That other route's eligibility rule (`review_status = 'approved'` AND
 * referenced by a PUBLISHED member's logo/cover/carousel slide) is
 * deliberately scoped to "what the public may see," which a freshly
 * uploaded gallery photo never satisfies: it's `review_status: 'approved'`
 * per uploadMemberMedia's own insert, but isn't assigned to any slot yet,
 * and the member themselves may still be draft/pending. Reusing that
 * route for gallery thumbnails would 404 every one of them. This route
 * instead re-implements a completely different rule -- OWNERSHIP, not
 * public eligibility -- via requireMemberSession() + a
 * `asset.member_id === session.memberId` check against the service-role
 * client (which bypasses RLS entirely, so this check is the only thing
 * standing between a signed-in member and every private file in the
 * bucket -- do not relax it).
 *
 * Cache-Control is deliberately NOT `public` here (unlike the other
 * route): eligibility is gated by WHO is asking (the session), not just by
 * the asset id, so a shared/CDN cache must never be allowed to serve one
 * member's private draft photo to a different visitor who guesses the
 * same URL later.
 */
async function findOwnedAsset(assetId: string, memberId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assetId)) return null;

  const supabase = await getSupabaseServiceRoleClient();

  const { data: asset } = await supabase
    .from("media_assets")
    .select("id, storage_path, mime_type, member_id")
    .eq("id", assetId)
    .maybeSingle();

  if (!asset || asset.member_id !== memberId) {
    // Flat 404 for both "doesn't exist" and "exists but isn't yours" --
    // matching api.member-media.$assetId.ts's own approach -- so a
    // different status code never confirms to a caller that some OTHER
    // member's asset id is real.
    return null;
  }

  return asset;
}

export const Route = createFileRoute("/api/admin-media/$assetId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        // Throws (redirects to /signin) if there's no session -- same
        // helper /admin's own beforeLoad uses, called directly the same
        // way admin.tsx and auth.callback.tsx already call
        // requireMemberSession()/throw redirect() from inside a
        // server-only context.
        const session = await requireMemberSession();

        const asset = await findOwnedAsset(params.assetId, session.memberId);
        if (!asset) {
          return new Response("Not found", { status: 404 });
        }

        const supabase = await getSupabaseServiceRoleClient();
        const { data: file, error } = await supabase.storage
          .from("member-media")
          .download(asset.storage_path);
        if (error || !file) {
          return new Response("Not found", { status: 404 });
        }

        return new Response(file, {
          headers: {
            "Content-Type": ALLOWED_MEDIA_MIME_TYPES.has(asset.mime_type)
              ? asset.mime_type
              : "application/octet-stream",
            // Identity-scoped (gated by session, not just by asset id) --
            // never publicly cacheable. See the doc comment above.
            "Cache-Control": "private, no-store",
            // Same rationale as the public route: asset.mime_type is
            // app-written, not browser-sniffed, but this is still
            // user-supplied content -- block MIME sniffing regardless.
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
