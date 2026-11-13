import { createFileRoute } from "@tanstack/react-router";
import { getMemberAlerts } from "@/lib/guild/member-alerts.server";
import { MemberAlertsTable } from "@/components/guild/MemberAlertsTable";

export const Route = createFileRoute("/guild/alerts")({
  loader: async () => ({ alerts: await getMemberAlerts() }),
  component: MemberAlertsRoute,
});

function MemberAlertsRoute() {
  const { alerts } = Route.useLoaderData();
  return <MemberAlertsTable alerts={alerts} />;
}
