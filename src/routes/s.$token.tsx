import { createFileRoute, redirect } from "@tanstack/react-router";
import { openStaffQr } from "@/lib/tap-card/plate.server";
import { TapCardShell } from "@/components/tap-card/TapCardShell";
import { StaffQrScreen } from "@/components/tap-card/StaffQrScreen";

/**
 * /s/<token>: a staff QR code. Scanning it notes the scan on this phone and
 * moves to /card, so the code isn't in the address of the page that checks
 * in. Nothing is recorded here. (spec 2026-11-24 one scan)
 */
export const Route = createFileRoute("/s/$token")({
  staleTime: 0,
  gcTime: 0,
  loader: async ({ params }) => {
    const view = await openStaffQr({ data: { token: params.token } });
    if (view.view === "noted") throw redirect({ to: "/card", replace: true });
    return view;
  },
  head: () => ({ meta: [{ title: "Confirm — Inland Scan Pass" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: StaffQrRoute,
});

function StaffQrRoute() {
  const view = Route.useLoaderData();
  return (
    <TapCardShell>
      <StaffQrScreen view={view} />
    </TapCardShell>
  );
}
