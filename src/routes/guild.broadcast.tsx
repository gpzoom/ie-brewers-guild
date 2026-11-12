import { createFileRoute, redirect } from "@tanstack/react-router";
import { getBroadcastPage } from "@/lib/guild/broadcast.server";
import { BroadcastScreen } from "@/components/guild/BroadcastScreen";

/**
 * /guild/broadcast: super admin only (docs/member-profiles.md, "Super
 * admin" > "Broadcast email screen"). A Guild admin is sent to the roster;
 * the loader and every action check again on the server.
 */
export const Route = createFileRoute("/guild/broadcast")({
  beforeLoad: ({ context }) => {
    if (!context.isSuperAdmin) throw redirect({ to: "/guild/roster" });
  },
  staleTime: 0,
  loader: () => getBroadcastPage(),
  component: BroadcastRoute,
});

function BroadcastRoute() {
  const page = Route.useLoaderData();
  return <BroadcastScreen page={page} />;
}
