import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * Whether maintenance mode is on (site_settings.maintenance_mode). The table
 * is super-admin-only, so this public read uses the service role, like
 * getActiveBrandTokens, and reads that one column only. Fails open: if it
 * can't be read, the site shows as normal.
 */
export const getMaintenanceMode = createServerFn({ method: "GET" }).handler(
  async (): Promise<boolean> => {
    try {
      const service = await getSupabaseServiceRoleClient();
      const { data, error } = await service
        .from("site_settings")
        .select("maintenance_mode")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return (data as { maintenance_mode?: boolean } | null)?.maintenance_mode === true;
    } catch (err) {
      console.error("getMaintenanceMode: couldn't read site_settings, showing the site", err);
      return false;
    }
  },
);
