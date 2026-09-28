import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import {
  getSiteSettingsCore,
  saveCalendarSyncIntervalCore,
  saveCarouselDwellCore,
  setHeroImageCore,
  type SiteSettingsView,
} from "@/lib/guild/site-settings";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { validateUploadedImage } from "@/lib/media/validate-file";
import { stripImageMetadata } from "@/lib/media/strip-exif";
import { sanitizeFilename } from "@/lib/media/media-gallery.server";

/**
 * The super admin's Settings screen (docs/member-profiles.md, "Super admin"
 * > "Settings"). Both go through the signed-in session: the super admin
 * check runs first, and site_settings' own policies check again.
 */
export const getSiteSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<SiteSettingsView> => {
    const supabase = await getSupabaseServerClientForRequest();
    return getSiteSettingsCore(supabase);
  },
);

export const saveCalendarSyncInterval = createServerFn({ method: "POST" })
  .inputValidator((data: { intervalMinutes: number }) => ({
    intervalMinutes: data?.intervalMinutes,
  }))
  .handler(async ({ data }): Promise<SiteSettingsView> => {
    const supabase = await getSupabaseServerClientForRequest();
    return saveCalendarSyncIntervalCore(supabase, data.intervalMinutes, new Date());
  });

export const saveCarouselDwell = createServerFn({ method: "POST" })
  .inputValidator((data: { seconds: number }) => ({ seconds: data?.seconds }))
  .handler(async ({ data }): Promise<SiteSettingsView> => {
    const supabase = await getSupabaseServerClientForRequest();
    return saveCarouselDwellCore(supabase, data.seconds, new Date());
  });

const HERO_MAX_BYTES = 10 * 1024 * 1024;

/**
 * The homepage hero image (Settings > Homepage hero image). The super admin
 * check runs first; the upload and the settings update go through the
 * session client, so site-images' storage policy and site_settings' policy
 * check for the super admin again. The replaced file is then removed.
 */
export const uploadHeroImage = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data: formData }): Promise<SiteSettingsView> => {
    const supabase = await getSupabaseServerClientForRequest();
    await requireSuperAdmin(supabase, "change the homepage image");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("No file provided.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = await validateUploadedImage({
      bytes,
      claimedMimeType: file.type,
      allowSvg: false,
      maxBytes: HERO_MAX_BYTES,
    });
    if (!validation.valid) throw new Error(validation.reason);
    let stripped: Uint8Array;
    try {
      stripped = stripImageMetadata(bytes, validation.detectedMimeType);
    } catch {
      throw new Error("Please upload a JPEG or PNG photo.");
    }

    const path = `hero/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from("site-images")
      .upload(path, stripped, { contentType: validation.detectedMimeType });
    if (uploadError) throw new Error("Couldn't upload the image — try again.");

    try {
      const { settings, previousPath } = await setHeroImageCore(supabase, path, new Date());
      if (previousPath) await supabase.storage.from("site-images").remove([previousPath]);
      return settings;
    } catch (err) {
      await supabase.storage.from("site-images").remove([path]);
      throw err;
    }
  });

/** Back to the site's built-in hero image; the uploaded file is removed. */
export const removeHeroImage = createServerFn({ method: "POST" }).handler(
  async (): Promise<SiteSettingsView> => {
    const supabase = await getSupabaseServerClientForRequest();
    const { settings, previousPath } = await setHeroImageCore(supabase, null, new Date());
    if (previousPath) await supabase.storage.from("site-images").remove([previousPath]);
    return settings;
  },
);
