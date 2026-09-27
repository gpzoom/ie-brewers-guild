import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClientForRequest } from "@/lib/supabase/server";
import {
  getSiteSettingsCore,
  saveCalendarSyncIntervalCore,
  type SiteSettingsView,
} from "@/lib/guild/site-settings";

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
