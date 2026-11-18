import { createFileRoute } from "@tanstack/react-router";
import { getStaffQrView } from "@/lib/tap-card/plate.server";
import { TapCardShell } from "@/components/tap-card/TapCardShell";
import { StaffQrScreen } from "@/components/tap-card/StaffQrScreen";

/**
 * /s/<token>: a brewery's bartender QR code, kept behind the counter. The
 * customer scans it after choosing at the counter plate; opening the page
 * only looks, the screen itself confirms. (spec 2026-11-18 bartender QR)
 */
export const Route = createFileRoute("/s/$token")({
  staleTime: 0,
  loader: ({ params }) => getStaffQrView({ data: { token: params.token } }),
  head: () => ({ meta: [{ title: "Confirm — Inland Tap Card" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: StaffQrRoute,
});

function StaffQrRoute() {
  const view = Route.useLoaderData();
  const { token } = Route.useParams();
  return (
    <TapCardShell>
      <StaffQrScreen token={token} view={view} />
    </TapCardShell>
  );
}
