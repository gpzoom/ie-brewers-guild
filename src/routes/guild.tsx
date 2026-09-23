import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireGuildAdminSession } from "@/lib/auth/require-guild-admin-session.server";
import { GuildShell } from "@/components/guild/GuildShell";

export const Route = createFileRoute("/guild")({
  beforeLoad: async () => {
    const session = await requireGuildAdminSession();
    return { userId: session.userId };
  },
  head: () => ({ meta: [{ title: "Guild admin — Inland Southern California Brewers Guild" }] }),
  component: GuildLayout,
});

function GuildLayout() {
  return (
    <GuildShell>
      <Outlet />
    </GuildShell>
  );
}
