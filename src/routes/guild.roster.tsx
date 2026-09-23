import { createFileRoute } from "@tanstack/react-router";
import { getRoster } from "@/lib/guild/roster.server";
import { RosterTable } from "@/components/guild/RosterTable";

export const Route = createFileRoute("/guild/roster")({
  loader: async () => getRoster(),
  component: RosterRoute,
});

function RosterRoute() {
  const entries = Route.useLoaderData();
  return <RosterTable entries={entries} />;
}
