import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSiteSettings } from "@/lib/guild/site-settings.server";
import { SiteSettingsScreen } from "@/components/guild/SiteSettingsScreen";

/**
 * /guild/settings: super admin only (docs/member-profiles.md, "Super admin"
 * > "Settings"). A Guild admin is sent to the roster; the loader checks
 * again on the server, and site_settings' policies refuse anyone else.
 */
export const Route = createFileRoute("/guild/settings")({
  beforeLoad: ({ context }) => {
    if (!context.isSuperAdmin) throw redirect({ to: "/guild/roster" });
  },
  staleTime: 0,
  loader: () => getSiteSettings(),
  component: SettingsRoute,
});

function SettingsRoute() {
  const settings = Route.useLoaderData();
  return <SiteSettingsScreen initial={settings} />;
}
