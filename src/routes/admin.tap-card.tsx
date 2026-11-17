import { createFileRoute } from "@tanstack/react-router";
import { TapCardSection } from "@/components/portal/TapCardSection";

/** /admin/tap-card: the same Tap Card screen as the portal's, for Edit as them. */
export const Route = createFileRoute("/admin/tap-card")({
  component: AdminTapCardRoute,
});

function AdminTapCardRoute() {
  const { memberId } = Route.useRouteContext();
  return <TapCardSection memberId={memberId} />;
}
