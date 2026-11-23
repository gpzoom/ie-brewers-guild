import { useEffect, useRef, useState } from "react";
import { confirmByStaffQr, type StaffQrPage } from "@/lib/tap-card/plate.server";
import { STAFF_QR_TURNED_OFF } from "@/lib/tap-card/staff-qr";
import { CanvasHeading, fieldErrorClass, leadClass, primaryButtonClass, secondaryButtonClass } from "@/components/public-forms/PublicFormParts";
import { Eyebrow } from "@/components/tap-card/TapCardShell";
import { PlateSuccess, plateRefusal, type PlateOk } from "@/components/tap-card/PlateSuccess";
import { CardScanner } from "@/components/tap-card/CardScanner";

/**
 * /s/<token>: the customer scanned the staff QR code. A plain check-in
 * records at once; using a reward asks first (spec 2026-11-18 staff QR).
 */
export function StaffQrScreen({ token, view }: { token: string; view: StaffQrPage }) {
  const [done, setDone] = useState<PlateOk | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function confirm(skipReward: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await confirmByStaffQr({ data: { token, skipReward } });
      if (result.kind === "ok") setDone(result);
      else setError(plateRefusal(result));
    } catch {
      setError("That didn't save. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (view.view === "check-in" && !started.current) {
      started.current = true;
      void confirm(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.view]);

  if (view.view === "unknown") {
    return (
      <>
        <CanvasHeading size="md">Inland Scan Pass</CanvasHeading>
        <p className={leadClass}>This code isn&rsquo;t working any more. Ask a staff member for the current one.</p>
      </>
    );
  }
  if (done && (view.view === "check-in" || view.view === "confirm")) {
    return <PlateSuccess memberName={view.memberName} memberSlug={view.memberSlug} plateCode={view.plateCode} initial={done} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <Eyebrow>{view.memberName}</Eyebrow>
      {view.view === "closed" && <CanvasHeading size="md">This taproom isn&rsquo;t taking Scan Pass check-ins right now.</CanvasHeading>}
      {view.view === "turned-off" && <CanvasHeading size="md">{STAFF_QR_TURNED_OFF}</CanvasHeading>}
      {view.view === "scan-plate-first" && (
        <>
          <CanvasHeading size="md">Scan the counter plate first</CanvasHeading>
          <p className={leadClass}>Scan the counter plate, choose what you&rsquo;d like, then scan this code again.</p>
          <CardScanner label="Scan the counter plate" />
        </>
      )}
      {view.view === "wrong-brewery" && (
        <>
          <CanvasHeading size="md">This code is for {view.memberName}</CanvasHeading>
          <p className={leadClass}>You started at a different brewery. Scan the counter plate here first, then this code again.</p>
        </>
      )}
      {view.view === "check-in" && !error && <CanvasHeading size="md">Checking you in…</CanvasHeading>}
      {view.view === "confirm" && (
        <>
          <CanvasHeading size="md">Use your reward now?</CanvasHeading>
          <p className="text-[20px] font-semibold text-ink">{view.rewardText}</p>
          <p className={leadClass}>This can&rsquo;t be undone without a staff member.</p>
          <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => confirm(false)}>
            {busy ? "Saving…" : "Yes, use it"}
          </button>
          <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => confirm(true)}>
            No, just check in
          </button>
        </>
      )}
      {error && (
        <p role="alert" className={fieldErrorClass}>
          {error}
        </p>
      )}
    </div>
  );
}
