import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import { validateUploadedImage } from "@/lib/media/validate-file";
import { stripImageMetadata } from "@/lib/media/strip-exif";
import type { MediaAssetRow } from "@/lib/supabase/types";

export const listMemberMedia = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: assets, error } = await supabase
      .from("media_assets")
      .select("*")
      .eq("member_id", data.memberId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return assets as MediaAssetRow[];
  });

const MAX_SAFE_FILENAME_LENGTH = 120;

/**
 * `file.name` is fully user/attacker-controlled and gets concatenated
 * directly into the storage object path
 * (`${memberId}/${uuid}-${sanitizeFilename(file.name)}`). Without this, a
 * crafted name containing path separators (`/`, `\`), a leading `.`/`..`
 * segment, control characters, or an extreme length could manipulate the
 * storage path structure or blow past a downstream path-length limit. This
 * doesn't need to preserve the original name exactly -- it only needs to be
 * safe -- so it collapses anything outside a conservative allowlist to `_`
 * and caps the length, keeping the tail (where the extension lives).
 */
function sanitizeFilename(rawName: string): string {
  const base = rawName.split(/[\\/]/).pop() ?? "";
  const safe = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  const capped = safe.slice(-MAX_SAFE_FILENAME_LENGTH);
  return capped.length > 0 ? capped : "upload";
}

/**
 * The generic gallery-upload path -- a member uploading a file they
 * already have (spec, "Where media comes from", path 1 of 2; path 2 is the
 * creator-upload link, Task 20). Writes with the session-bound anon-key
 * client, so RLS's "media_assets: owners and editors can insert" and
 * "member-media: owners and editors manage their folder" storage policy
 * are what actually authorize this -- no service-role client involved.
 */
export const uploadMemberMedia = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data: formData }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error("Not signed in.");

    const memberId = String(formData.get("memberId") ?? "");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("No file provided.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = await validateUploadedImage({
      bytes,
      claimedMimeType: file.type,
      allowSvg: false,
    });
    if (!validation.valid) throw new Error(validation.reason);

    // stripImageMetadata throws for any format it doesn't explicitly
    // parse -- its own doc comment: "Callers MUST treat a thrown error as
    // 'reject this upload', never as 'fall back to the original bytes'."
    // validateUploadedImage above only lets a genuine JPEG/PNG signature
    // reach this point on the non-SVG (gallery) path, so this still fires
    // for real, non-exceptional uploads it can't safely strip -- notably a
    // Live Photo/Motion Photo JPEG (a second embedded image with its own
    // untouched EXIF/GPS appended after the primary EOI, which
    // strip-exif.ts deliberately refuses to pass through) and any
    // truncated/corrupt file. Left unhandled, that throw was an unhandled
    // promise rejection with no user-facing message; caught here and
    // turned into a clean, actionable one instead.
    let stripped: Uint8Array;
    try {
      stripped = stripImageMetadata(bytes, validation.detectedMimeType);
    } catch {
      throw new Error(
        "Please upload a JPEG or PNG photo — other formats (including HEIC, Live Photos, and WebP) aren't supported yet.",
      );
    }

    const storagePath = `${memberId}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from("member-media")
      .upload(storagePath, stripped, { contentType: validation.detectedMimeType });
    if (uploadError) throw new Error(uploadError.message);

    const { data: row, error: insertError } = await supabase
      .from("media_assets")
      .insert({
        member_id: memberId,
        storage_path: storagePath,
        kind: "image",
        mime_type: validation.detectedMimeType,
        byte_size: stripped.byteLength,
        original_filename: file.name,
        source: "member_upload",
        uploaded_by_user_id: userData.user.id,
        review_status: "approved",
      })
      .select("*")
      .single();
    if (insertError) throw new Error(insertError.message);

    return row as MediaAssetRow;
  });

export const deleteMemberMedia = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; storagePath: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();

    // Delete the DB row first, then the storage object -- and check the
    // row count, not just `error`. PostgREST reports an RLS-denied delete
    // as SUCCESS with zero rows affected, not as an `error` (the same
    // gotcha member-basics.server.ts's and hours-editor.server.ts's own
    // `.select("id")` + row-count checks already guard against). Without
    // this check, a delete blocked by RLS (e.g. someone else's asset id)
    // would silently report `{ ok: true }` -- which is exactly the case
    // MediaGallery.tsx's optimistic UI removal needs a real failure signal
    // for, so it can roll the asset back into view instead of leaving it
    // permanently (and wrongly) hidden. Removing the DB row before the
    // storage object also avoids the reverse inconsistency: if the delete
    // is blocked, the file is never removed out from under a row that
    // still exists.
    const { data: deleted, error } = await supabase
      .from("media_assets")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) {
      throw new Error("Delete failed — you may not have permission to remove this photo.");
    }

    await supabase.storage.from("member-media").remove([data.storagePath]);
    return { ok: true as const };
  });
