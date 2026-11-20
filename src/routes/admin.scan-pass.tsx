import { createFileRoute } from "@tanstack/react-router";
import { TapCardSection } from "@/components/portal/TapCardSection";

/** /admin/scan-pass: the same Scan Pass screen as the portal's, for Edit as them. */
export const Route = createFileRoute("/admin/scan-pass")({
  component: AdminTapCardRoute,
});

function AdminTapCardRoute() {
  const { memberId } = Route.useRouteContext();
  return <TapCardSection memberId={memberId} />;
}
