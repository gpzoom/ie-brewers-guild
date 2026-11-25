import { useContext, useState } from "react";
import { AgeGateShown } from "@/components/site/age-gate-context";
import { confirmPendingCheckIn, type PendingCheckIn } from "@/lib/tap-card/plate.server";
import { getPosition } from "@/lib/tap-card/get-position";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fieldErrorClass, hintClass, leadClass, primaryButtonClass, secondaryButtonClass } from "@/components/public-forms/PublicFormParts";
import { Eyebrow } from "@/components/tap-card/TapCardShell";
import { plateRefusal, type PlateOk } from "@/components/tap-card/PlateSuccess";
import { RewardChoices, choiceOf, keyOf, waitingRewards } from "@/components/tap-card/RewardChoices";

/**
 * A staff QR was just scanned (spec 2026-11-24): nothing is recorded until
 * the customer taps here. Key it by pending.scanAt.
 */
export function CheckInModal({
  pending,
  onDone,
  onClose,
  onScanAgain,
}: {
  pending: PendingCheckIn;
  onDone: (ok: PlateOk) => void;
  onClose: () => void;
  onScanAgain: () => void;
}) {
  const ageGateShown = useContext(AgeGateShown);
  const waiting = waitingRewards(pending.state);
  const [choice, setChoice] = useState(waiting[0] ? keyOf(waiting[0]) : "none");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lapsed, setLapsed] = useState(false);

  const picked = waiting.find((r) => keyOf(r) === choice) ?? null;

  async function confirm(key: string) {
    setBusy(true);
    setError(null);
    try {
      const position = await getPosition(navigator.geolocation);
      const result = await confirmPendingCheckIn({ data: { scanAt: pending.scanAt, choice: choiceOf(key), position } });
      if (result.kind === "ok") {
        onDone(result);
        return;
      }
      setError(plateRefusal(result));
      if (result.kind === "scan-again") setLapsed(true);
    } catch {
      setError("That didn't save. Check the connection and try again.");
    }
    setBusy(false);
  }

  const heading = lapsed
    ? "Scan the staff QR code again"
    : asking
    ? "Use your reward now?"
    : pending.checkedInToday
      ? `Checked in today — visit #${pending.nextVisitNumber}`
      : `Hi ${pending.firstName} — this will be visit #${pending.nextVisitNumber}`;
  const buttonLabel = picked ? "Use my reward" : pending.checkedInToday ? "Show my confirmation" : "Check in";

  // The 21+ check comes first; this opens once it's answered.
  if (ageGateShown) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="max-h-[92dvh] max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-[18px] border-canvas-border bg-canvas sm:max-w-[440px]">
        <Eyebrow>{pending.memberName}</Eyebrow>
        <DialogTitle className="font-display text-[22px] font-bold leading-tight text-ink">{heading}</DialogTitle>
        {lapsed ? (
          <div key="lapsed" className="grid gap-4">
            <DialogDescription role="alert" className={fieldErrorClass}>
              {error}
            </DialogDescription>
            <button type="button" autoFocus className={`${primaryButtonClass} min-h-14 text-[17px]`} onClick={onScanAgain}>
              Scan QR again
            </button>
            <button type="button" className={secondaryButtonClass} onClick={onClose}>
              Not now
            </button>
          </div>
        ) : asking && picked ? (
          <div key="ask" className="grid gap-4">
            <p className="text-[20px] font-semibold text-ink">{picked.reward}</p>
            <DialogDescription className={leadClass}>This can&rsquo;t be undone without a staff member.</DialogDescription>
            <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => confirm(choice)}>
              {busy ? "Saving…" : "Yes, use it"}
            </button>
            <button type="button" autoFocus className={secondaryButtonClass} disabled={busy} onClick={() => confirm("none")}>
              No, just check in
            </button>
          </div>
        ) : (
          <div key="choose" className="grid gap-4">
            {pending.state.used && <p className={leadClass}>You&rsquo;ve used today&rsquo;s reward here: {pending.state.used.reward}.</p>}
            <RewardChoices waiting={waiting} choice={choice} onChange={setChoice} />
            <button type="button" className={`${primaryButtonClass} min-h-14 text-[17px]`} disabled={busy} onClick={() => (picked ? setAsking(true) : confirm("none"))}>
              {busy ? "Saving…" : buttonLabel}
            </button>
            <DialogDescription className={hintClass}>
              We&rsquo;ll ask for your location to help the taproom spot misuse. You can say no.
            </DialogDescription>
            <button type="button" className={secondaryButtonClass} disabled={busy} onClick={onClose}>
              Not now
            </button>
          </div>
        )}
        {error && !lapsed && (
          <p role="alert" className={fieldErrorClass}>
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
