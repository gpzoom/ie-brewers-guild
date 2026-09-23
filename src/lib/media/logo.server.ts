import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { readPngHeight, validateUploadedImage } from "@/lib/media/validate-file";
import { stripImageMetadata } from "@/lib/media/strip-exif";
import { sanitizeFilename } from "@/lib/media/media-gallery.server";
import { recordAuditLogIfImpersonating } from "@/lib/guild/audit-log.server";

const MIN_LOGO_HEIGHT_PX = 400;

/**
 * PNG-only, NOT "PNG or SVG" -- a deliberate, later narrowing of this
 * plan's original spec ("Logos and assets": "PNG or SVG only"). Reason
 * (product-owner decision, not a validate-file.ts security failure):
 * `member-logos` is a genuinely PUBLIC Supabase Storage bucket (see
 * `supabase/migrations/20260922041434_storage_buckets.sql`), and its raw
 * public URL is already used as `og:image` for a member with no cover
 * photo (`src/lib/members/member-profile.server.ts`'s `logoPublicUrl`,
 * consumed by `src/routes/members_.$slug.tsx`) -- i.e. directly
 * navigable/unfurl-able by design, not just rendered inside an `<img
 * src>`. validate-file.ts's own module-level comment documents exactly
 * this: its SVG denylist (`containsDangerousSvgContent`) is cheap
 * defense-in-depth, not a full sanitizer, and a bypass reaching real
 * script execution becomes live the moment logo upload lands UNLESS
 * either the serving path is hardened or SVG is dropped from this path
 * entirely. Dropping SVG here (rather than hardening how it's served) is
 * the option the product owner chose: raster formats (PNG) carry no
 * script-execution surface at all, so this removes the risk class
 * outright rather than mitigating it, at the accepted cost that a
 * vector/transparent-PNG-only logo can't be uploaded as SVG.
 *
 * IMPORTANT: `allowSvg: true` below is NOT "SVG is allowed" -- per
 * validate-file.ts's own doc comment on `allowedRasterMimeTypes`,
 * `allowSvg` doubles as the flag that selects PNG-only (true) vs.
 * PNG-or-JPEG (false) for the RASTER allowlist. Passing `allowSvg: false`
 * here would accidentally start ACCEPTING JPEG for logos -- exactly the
 * spec requirement this task must preserve says NOT to do. So this stays
 * `true` (to keep JPEG correctly rejected with the explanatory message),
 * and SVG is rejected by a separate, explicit check just below instead --
 * even though validateUploadedImage itself would call a well-formed,
 * non-dangerous SVG `valid: true`.
 */
export const uploadMemberLogo = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data: formData }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const memberId = String(formData.get("memberId") ?? "");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("No file provided.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    // Logos are PNG-only (see this function's doc comment above) -- SVG is
    // rejected AFTER validateUploadedImage succeeds, by the explicit check
    // just below. Without a logo-specific maxBytes, the expensive SVG
    // tokenize/scan inside validateUploadedImage would still run to
    // completion on anything up to the module's general 25MB default before
    // that later PNG-only rejection ever happens -- reachable before any
    // auth check in this handler. 2MB is well above any legitimate PNG logo
    // size and keeps that worst-case scan cost small.
    const validation = await validateUploadedImage({
      bytes,
      claimedMimeType: file.type,
      allowSvg: true,
      maxBytes: 2 * 1024 * 1024,
    });
    if (!validation.valid) {
      // "Reject at upload with a message that says why, rather than accepting and looking bad" (spec).
      throw new Error(
        validation.reason.includes("PNG or SVG")
          ? "Logos must be PNG — JPG can't have a transparent background, so it won't sit cleanly on the cross-link card. Export a PNG instead."
          : validation.reason,
      );
    }

    // Product-owner decision (see this function's own doc comment above):
    // SVG is rejected here even though validateUploadedImage just said it
    // was safe and well-formed. This is a scope narrowing, not a security
    // failure of that module -- do not "fix" by loosening this check.
    if (validation.detectedMimeType === "image/svg+xml") {
      throw new Error("SVG logos aren't supported — please upload a PNG with a transparent background instead.");
    }

    if (validation.detectedMimeType === "image/png") {
      const height = readPngHeight(bytes);
      if (height !== null && height < MIN_LOGO_HEIGHT_PX) {
        throw new Error(`This logo is ${height}px tall — logos need to be at least ${MIN_LOGO_HEIGHT_PX}px tall.`);
      }
    }

    const stripped = stripImageMetadata(bytes, validation.detectedMimeType);
    // Reuses media-gallery.server.ts's sanitizeFilename rather than
    // concatenating raw, attacker-controlled `file.name` straight into the
    // storage path -- same path-injection risk Task 14 already found and
    // fixed for the general gallery upload.
    const storagePath = `${memberId}/logo-${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from("member-logos")
      .upload(storagePath, stripped, { contentType: validation.detectedMimeType, upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { data: assetRow, error: insertError } = await supabase
      .from("media_assets")
      .insert({
        member_id: memberId,
        storage_path: storagePath,
        kind: "image",
        mime_type: validation.detectedMimeType,
        byte_size: stripped.byteLength,
        original_filename: file.name,
        source: "member_upload",
        review_status: "approved",
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);

    await recordAuditLogIfImpersonating({
      memberId,
      tableName: "media_assets",
      rowId: assetRow.id as string,
      action: "insert",
    });

    // .select("id") + row-count check -- PostgREST reports an RLS-denied
    // update as success with zero rows affected, not as an `error` (same
    // gotcha member-basics.server.ts/hours-editor.server.ts/
    // media-gallery.server.ts/carousel.server.ts/cover.server.ts's
    // updateCoverAsset all guard against for this exact members-table
    // write pattern). Without this, a write blocked by RLS would silently
    // report success even though logo_asset_id was never actually set.
    const { data: updated, error: memberError } = await supabase
      .from("members")
      .update({ logo_asset_id: assetRow.id })
      .eq("id", memberId)
      .select("id");
    if (memberError) throw new Error(memberError.message);
    if (!updated || updated.length === 0) {
      throw new Error("Save failed — you may not have permission to edit this member.");
    }

    await recordAuditLogIfImpersonating({
      memberId,
      tableName: "members",
      rowId: memberId,
      action: "update",
    });

    const { data: publicUrl } = supabase.storage.from("member-logos").getPublicUrl(storagePath);
    return { assetId: assetRow.id as string, publicUrl: publicUrl.publicUrl };
  });

/**
 * Resolves the member's current logo to a public URL for admin.media.tsx's
 * loader to hand LogoUploader as `initialLogoUrl` -- same two-step
 * (members.logo_asset_id -> media_assets.storage_path -> getPublicUrl)
 * member-profile.server.ts's own logoPublicUrl resolution uses, just
 * scoped to one member instead of a whole profile-page payload. A missing
 * asset row (shouldn't happen, but logo_asset_id isn't FK-enforced against
 * a caller-owned row any more strictly than cover_asset_id is -- see
 * cover.server.ts's updateCoverAsset doc comment) degrades to "no logo"
 * rather than throwing, since a broken logo reference shouldn't block the
 * whole media admin page from loading.
 */
export const getMemberLogo = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: member, error } = await supabase
      .from("members")
      .select("logo_asset_id")
      .eq("id", data.memberId)
      .single();
    if (error || !member) throw new Error("Member not found.");
    if (!member.logo_asset_id) return { logoUrl: null };

    const { data: asset, error: assetError } = await supabase
      .from("media_assets")
      .select("storage_path")
      .eq("id", member.logo_asset_id)
      .single();
    if (assetError || !asset) return { logoUrl: null };

    const { data: publicUrl } = supabase.storage.from("member-logos").getPublicUrl(asset.storage_path);
    return { logoUrl: publicUrl.publicUrl };
  });
