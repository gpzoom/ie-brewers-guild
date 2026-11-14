import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import {
  deleteAnnouncementCore,
  deleteGalleryImageCore,
  listHomepageSectionsCore,
  moveSectionCore,
  saveAnnouncementCore,
  saveGalleryImageCore,
  setSectionEnabledCore,
  updateGalleryAltCore,
  type AnnouncementInput,
} from "@/lib/guild/homepage-sections";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { validateUploadedImage } from "@/lib/media/validate-file";
import { stripImageMetadata } from "@/lib/media/strip-exif";
import { readImageDimensions } from "@/lib/media/image-dimensions";
import { sanitizeFilename } from "@/lib/media/media-gallery.server";

/**
 * The super admin's homepage sections and announcement gallery (Settings >
 * Homepage). Each wraps a core in homepage-sections.ts, which checks for the
 * super admin first; the writes go through the session client, so the tables'
 * policies check again.
 */
export const listHomepageSections = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await getSupabaseServerClientForRequest();
  return listHomepageSectionsCore(supabase, new Date());
});

export const setSectionEnabled = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; enabled: boolean }) => ({
    id: data?.id,
    enabled: data?.enabled,
  }))
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    await setSectionEnabledCore(supabase, data.id, data.enabled, new Date());
  });

export const moveSection = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; direction: -1 | 1 }) => ({
    id: data?.id,
    direction: data?.direction,
  }))
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    await moveSectionCore(supabase, data.id, data.direction);
  });

export const saveAnnouncement = createServerFn({ method: "POST" })
  .inputValidator((data: AnnouncementInput) => data)
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    return saveAnnouncementCore(supabase, data, new Date());
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => ({ id: data?.id }))
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    await deleteAnnouncementCore(supabase, data.id);
  });

export const updateGalleryAlt = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; altText: string }) => ({
    id: data?.id,
    altText: data?.altText,
  }))
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    await updateGalleryAltCore(supabase, data.id, data.altText, new Date());
  });

const GALLERY_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Adds an image to the announcement gallery (mirrors uploadHeroImage): validate,
 * strip metadata, upload to site-images/announcements/, save the row, and
 * remove the file again if the save fails.
 */
export const uploadGalleryImage = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data: formData }): Promise<{ id: string }> => {
    const supabase = await getSupabaseServerClientForRequest();
    await requireSuperAdmin(supabase, "change the homepage");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("No file provided.");
    const altText = String(formData.get("altText") ?? "").trim();
    if (!altText) throw new Error("Add a short description of the image.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = await validateUploadedImage({
      bytes,
      claimedMimeType: file.type,
      allowSvg: false,
      maxBytes: GALLERY_MAX_BYTES,
    });
    if (!validation.valid) throw new Error(validation.reason);
    let stripped: Uint8Array;
    try {
      stripped = stripImageMetadata(bytes, validation.detectedMimeType);
    } catch {
      throw new Error("Please upload a JPEG or PNG photo.");
    }
    const dimensions = readImageDimensions(stripped);

    const path = `announcements/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from("site-images")
      .upload(path, stripped, { contentType: validation.detectedMimeType });
    if (uploadError) throw new Error("Couldn't upload the image — try again.");

    try {
      return await saveGalleryImageCore(
        supabase,
        {
          path,
          altText,
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
        },
        new Date(),
      );
    } catch (err) {
      await supabase.storage.from("site-images").remove([path]);
      throw err;
    }
  });

/** Deletes an unused gallery image, then its file. */
export const deleteGalleryImage = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => ({ id: data?.id }))
  .handler(async ({ data }) => {
    const supabase = await getSupabaseServerClientForRequest();
    const { removedPath } = await deleteGalleryImageCore(supabase, data.id);
    await supabase.storage.from("site-images").remove([removedPath]);
  });
