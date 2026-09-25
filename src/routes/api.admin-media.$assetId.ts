import { createFileRoute } from "@tanstack/react-router";
import {
  getSupabaseServerClientForRequest,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import {
  readImpersonationState,
  touchImpersonationActivity,
} from "@/lib/guild/impersonation.server";
import { canViewAdminMedia, needsMembershipLookup } from "@/lib/media/admin-media-access";

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
 * public eligibility -- via the signed-in session + canViewAdminMedia
 * (the impersonated member only while editing as them, otherwise a
 * member_users link to the asset's member), checked against the
 * service-role client (which bypasses RLS entirely, so this check is the
 * only thing standing between a signed-in member and every private file in
 * the bucket -- do not relax it).
 *
 * Cache-Control is deliberately NOT `public` here (unlike the other
 * route): eligibility is gated by WHO is asking (the session), not just by
 * the asset id, so a shared/CDN cache must never be allowed to serve one
 * member's private draft photo to a different visitor who guesses the
 * same URL later.
 */
/**
 * Who's asking, resolved from the session the way the Member Portal does
 * it (portal-session.server.ts), not through requireMemberSession: that
 * one redirects a Guild admin who is also linked to a member, or someone
 * holding another admin's stale impersonation cookie, which would turn
 * every photo in the wizard and the preview into a broken image. The
 * decision itself is canViewAdminMedia (src/lib/media/admin-media-access.ts).
 */
async function resolveViewer() {
  const sessionClient = await getSupabaseServerClientForRequest();
  const { data } = await sessionClient.auth.getUser();
  const userId = data?.user?.id ?? null;
  const impersonation = userId ? await readImpersonationState() : null;
  if (impersonation && impersonation.actorUserId === userId) {
    await touchImpersonationActivity(impersonation);
  }
  return { userId, impersonation };
}

async function findOwnedAsset(assetId: string, viewer: Awaited<ReturnType<typeof resolveViewer>>) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assetId)) return null;
  if (!viewer.userId) return null;

  const supabase = await getSupabaseServiceRoleClient();

  const { data: asset } = await supabase
    .from("media_assets")
    .select("id, storage_path, mime_type, member_id")
    .eq("id", assetId)
    .maybeSingle();

  // Flat 404 for both "doesn't exist" and "exists but isn't yours" --
  // matching api.member-media.$assetId.ts's own approach -- so a
  // different status code never confirms to a caller that some OTHER
  // member's asset id is real.
  if (!asset) return null;

  let isLinkedToAssetMember = false;
  if (needsMembershipLookup(viewer)) {
    const { data: link } = await supabase
      .from("member_users")
      .select("member_id")
      .eq("user_id", viewer.userId)
      .eq("member_id", asset.member_id)
      .maybeSingle();
    isLinkedToAssetMember = Boolean(link);
  }

  const allowed = canViewAdminMedia({
    userId: viewer.userId,
    impersonation: viewer.impersonation,
    assetMemberId: asset.member_id as string,
    isLinkedToAssetMember,
  });
  return allowed ? asset : null;
}

export const Route = createFileRoute("/api/admin-media/$assetId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        // Signed out, or not theirs: the same flat 404 (never a redirect --
        // this serves <img> tags, where a redirect only breaks the image).
        const viewer = await resolveViewer();
        const asset = await findOwnedAsset(params.assetId, viewer);
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
