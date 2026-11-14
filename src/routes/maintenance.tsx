import { createFileRoute, redirect } from "@tanstack/react-router";
import { MaintenanceMode } from "@/components/site/MaintenanceMode";
import { getGuildAdminStatus } from "@/lib/guild/guild-admin-status.server";

/**
 * The maintenance page (src/lib/site/maintenance.ts). While the switch is
 * off, visitors are sent home; signed-in Guild admins can still preview it.
 */
export const Route = createFileRoute("/maintenance")({
  beforeLoad: async ({ context }) => {
    if (context.maintenanceOn) return;
    const { isGuildAdmin } = await getGuildAdminStatus();
    if (!isGuildAdmin) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Down for Maintenance — Inland Southern California Brewers Guild" },
      { name: "description", content: "We're making a few improvements and will be back shortly." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MaintenanceMode,
});
