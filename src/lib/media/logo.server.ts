import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { readPngHeight, validateUploadedImage } from "@/lib/media/validate-file";
import { stripImageMetadata } from "@/lib/media/strip-exif";
import { resolveImageDimensions } from "@/lib/media/image-dimensions";
import { sanitizeFilename } from "@/lib/media/media-gallery.server";
import { recordAuditLogIfImpersonating } from "@/lib/guild/audit-log.server";
import { normalizeSections } from "@/lib/drafts/sections";

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
    // See image-dimensions.ts -- header first, browser-measured fallback.
    const dimensions = resolveImageDimensions(stripped, formData);

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
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
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

    // Phase 2: the new logo goes into the member's DRAFT (basics), not the
    // live row -- it shows on the public page once they publish. The file
    // and its media_assets row above are live right away, like any gallery
    // upload (the gallery isn't drafted). save_member_draft_section checks
    // the caller may edit basics and that the asset is this member's, and
    // audits it when the caller is a Guild admin.
    const { data: draftRow, error: draftError } = await supabase.rpc("save_member_draft_section", {
      p_member_id: memberId,
      p_section: "basics",
      p_data: { logo_asset_id: assetRow.id },
    });
    if (draftError || !draftRow) {
      throw new Error(
        draftError?.message ??
          "Your logo was uploaded to your gallery, but we couldn't set it as your logo — try again.",
      );
    }

    const { data: publicUrl } = supabase.storage.from("member-logos").getPublicUrl(storagePath);
    return {
      assetId: assetRow.id as string,
      publicUrl: publicUrl.publicUrl,
      dirtySections: normalizeSections((draftRow as { dirty_sections: unknown }).dirty_sections),
    };
  });
