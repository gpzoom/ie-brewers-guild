import { createFileRoute, redirect } from "@tanstack/react-router";
import { getGuildAdmins } from "@/lib/guild/guild-admins.server";
import { GuildAdminsScreen } from "@/components/guild/GuildAdminsScreen";

/**
 * /guild/admins: super admin only (docs/member-profiles.md, "Super admin" >
 * "Guild admins screen"). A Guild admin is sent to the roster; the loader
 * and every action check again on the server.
 */
export const Route = createFileRoute("/guild/admins")({
  beforeLoad: ({ context }) => {
    if (!context.isSuperAdmin) throw redirect({ to: "/guild/roster" });
  },
  staleTime: 0,
  loader: () => getGuildAdmins(),
  component: GuildAdminsRoute,
});

function GuildAdminsRoute() {
  const view = Route.useLoaderData();
  return <GuildAdminsScreen admins={view.admins} invites={view.invites} />;
}
