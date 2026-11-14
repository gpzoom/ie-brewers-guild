import { createFileRoute } from "@tanstack/react-router";
import { MaintenanceMode } from "@/components/site/MaintenanceMode";

/**
 * The maintenance page, viewable here for review. The switch that shows it
 * to the public on every page comes after the owner approves it.
 */
export const Route = createFileRoute("/maintenance")({
  head: () => ({
    meta: [
      { title: "Down for Maintenance — Inland Southern California Brewers Guild" },
      { name: "description", content: "We're making a few improvements and will be back shortly." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MaintenanceMode,
});
