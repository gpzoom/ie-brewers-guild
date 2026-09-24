import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireGuildAdminSession } from "@/lib/auth/require-guild-admin-session.server";

export const Route = createFileRoute("/guild")({
  beforeLoad: async () => {
    const session = await requireGuildAdminSession();
    return { userId: session.userId };
  },
  head: () => ({ meta: [{ title: "Guild admin — Inland Southern California Brewers Guild" }] }),
  component: GuildLayout,
});

// No shell component here any more -- the Guild admin nav now renders
// globally, right under the public header, via __root.tsx's GuildAdminBar
// (see that component's doc comment for why). __root.tsx's own <main>
// already wraps this Outlet, so this is just padding, not a landmark.
function GuildLayout() {
  return (
    <div className="px-4 py-6">
      <Outlet />
    </div>
  );
}
