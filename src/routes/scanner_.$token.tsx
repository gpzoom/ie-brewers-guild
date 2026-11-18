import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { checkScannerLink, claimScannerLink } from "@/lib/tap-card/card-view.server";
import { CanvasHeading, fieldErrorClass, leadClass, primaryButtonClass } from "@/components/public-forms/PublicFormParts";
import { Eyebrow, TapCardShell } from "@/components/tap-card/TapCardShell";

/**
 * A brewery's bar-device setup link (made on Portal/Admin > Tap Card, often
 * printed as a QR code). Opening it only looks; the button uses it up, so a
 * message app previewing the link can't spend it.
 */
export const Route = createFileRoute("/scanner_/$token")({
  staleTime: 0,
  loader: ({ params }) => checkScannerLink({ data: { token: params.token } }),
  head: () => ({ meta: [{ title: "Bar device setup — Inland Tap Card" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: ScannerSetup,
});

function DeadLink() {
  return (
    <>
      <CanvasHeading size="md">This setup link doesn&rsquo;t work</CanvasHeading>
      <p className={leadClass}>
        Each setup link works once, and it may already have been used or turned off. Make a new one on your Tap Card page
        in the Member Portal.
      </p>
    </>
  );
}

function ScannerSetup() {
  const link = Route.useLoaderData();
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSetUp() {
    setBusy(true);
    setError(null);
    try {
      const result = await claimScannerLink({ data: { token } });
      if (result.ok) await navigate({ to: "/scanner" });
      else setFailed(true);
    } catch {
      setError("That didn't work. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <TapCardShell>
      {!link.ok || failed ? (
        <DeadLink />
      ) : (
        <>
          <Eyebrow>{link.memberName}</Eyebrow>
          <CanvasHeading size="md">Set up this device for the bar</CanvasHeading>
          <p className={leadClass}>
            Do this on the phone or tablet your staff will use to check in Tap Cards, in its usual web browser. This link
            works once.
          </p>
          <div>
            <button type="button" className={primaryButtonClass} onClick={onSetUp} disabled={busy}>
              {busy ? "Setting up…" : "Set up this device"}
            </button>
          </div>
          {error && (
            <p role="alert" className={fieldErrorClass}>
              {error}
            </p>
          )}
        </>
      )}
    </TapCardShell>
  );
}
