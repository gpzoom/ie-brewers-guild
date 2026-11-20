import { createFileRoute } from "@tanstack/react-router";
import { getPlateView } from "@/lib/tap-card/plate.server";
import { TapCardShell } from "@/components/tap-card/TapCardShell";
import { PlateScreen } from "@/components/tap-card/PlateScreen";

/**
 * /t/<code>: a brewery's counter plate. The customer taps or scans it with
 * their own phone; the staff member confirms with the staff code. Opening the
 * page records nothing. (spec 2026-11-17 offers & loyalty)
 */
export const Route = createFileRoute("/t/$code")({
  staleTime: 0,
  loader: ({ params }) => getPlateView({ data: { code: params.code } }),
  head: () => ({ meta: [{ title: "Check in — Inland Scan Pass" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: PlateRoute,
});

function PlateRoute() {
  const view = Route.useLoaderData();
  return (
    <TapCardShell>
      <PlateScreen view={view} />
    </TapCardShell>
  );
}
