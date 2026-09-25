import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireGuildAdminSession } from "@/lib/auth/require-guild-admin-session.server";
import { getGuildShellSummary } from "@/lib/guild/guild-shell.server";
import { GuildShell } from "@/components/guild/GuildShell";

export const Route = createFileRoute("/guild")({
  beforeLoad: async () => {
    const session = await requireGuildAdminSession();
    return { userId: session.userId };
  },
  // Sidebar counts + the admin's email for GuildShell. Re-runs on every
  // /guild navigation and on router.invalidate() (which every Guild editor
  // already calls after a change), so the Inquiries badge follows along.
  loader: async () => ({ summary: await getGuildShellSummary() }),
  head: () => ({ meta: [{ title: "Guild admin — Inland Southern California Brewers Guild" }] }),
  component: GuildLayout,
});

function GuildLayout() {
  const { summary } = Route.useLoaderData();
  return (
    <GuildShell summary={summary}>
      <Outlet />
    </GuildShell>
  );
}
