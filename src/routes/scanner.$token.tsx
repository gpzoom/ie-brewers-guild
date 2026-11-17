import { createFileRoute, redirect } from "@tanstack/react-router";
import { claimScannerLink } from "@/lib/tap-card/card-view.server";
import { CanvasHeading, leadClass } from "@/components/public-forms/PublicFormParts";
import { TapCardShell } from "@/components/tap-card/TapCardShell";

/** A brewery's bar-device setup link (made on Portal/Admin > Tap Card). Opening it remembers this browser. */
export const Route = createFileRoute("/scanner/$token")({
  loader: async ({ params }) => {
    const result = await claimScannerLink({ data: { token: params.token } });
    if (result.ok) throw redirect({ to: "/scanner" });
    return result;
  },
  head: () => ({ meta: [{ title: "Bar device setup — Inland Tap Card" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: () => (
    <TapCardShell>
      <CanvasHeading size="md">This setup link doesn&rsquo;t work</CanvasHeading>
      <p className={leadClass}>
        It may have been turned off. Make a new one on your Tap Card page in the Member Portal.
      </p>
    </TapCardShell>
  ),
});
