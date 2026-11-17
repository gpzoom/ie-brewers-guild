import { createFileRoute } from "@tanstack/react-router";
import { getScannerStatus } from "@/lib/tap-card/card-view.server";
import { CanvasHeading, leadClass } from "@/components/public-forms/PublicFormParts";
import { Eyebrow, TapCardShell } from "@/components/tap-card/TapCardShell";

/** /scanner: tells staff whether this phone or tablet is set up as a bar device. */
export const Route = createFileRoute("/scanner")({
  staleTime: 0,
  loader: () => getScannerStatus(),
  head: () => ({ meta: [{ title: "Bar device — Inland Tap Card" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: ScannerRoute,
});

function ScannerRoute() {
  const status = Route.useLoaderData();
  return (
    <TapCardShell>
      {status.kind === "none" ? (
        <>
          <CanvasHeading size="md">This device isn&rsquo;t set up</CanvasHeading>
          <p className={leadClass}>
            Make a bar-device link on your Tap Card page in the Member Portal, then open it on this phone or tablet in its
            usual web browser.
          </p>
        </>
      ) : (
        <>
          <Eyebrow>{status.label}</Eyebrow>
          <CanvasHeading size="md">
            {status.kind === "ok" ? "This device is ready" : "This device can’t record visits right now"}
          </CanvasHeading>
          <p className={leadClass}>
            {status.kind === "ok"
              ? `This device is ready to check in Tap Cards for ${status.memberName}. Tap a card on this phone, or scan its QR code with the camera app.`
              : `${status.memberName} isn’t on the trail at the moment, so nothing can be recorded.`}
          </p>
        </>
      )}
    </TapCardShell>
  );
}
