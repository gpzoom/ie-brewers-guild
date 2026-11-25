import { useState } from "react";
import { confirmPendingCheckIn, type PendingCheckIn } from "@/lib/tap-card/plate.server";
import { getPosition } from "@/lib/tap-card/get-position";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fieldErrorClass, hintClass, leadClass, primaryButtonClass, secondaryButtonClass } from "@/components/public-forms/PublicFormParts";
import { Eyebrow } from "@/components/tap-card/TapCardShell";
import { plateRefusal, type PlateOk } from "@/components/tap-card/PlateSuccess";
import { RewardChoices, choiceOf, keyOf, waitingRewards } from "@/components/tap-card/RewardChoices";

/**
 * A staff QR was just scanned (spec 2026-11-24): nothing is recorded until
 * the customer taps here. Give it a key that changes with each scan.
 */
export function CheckInModal({ pending, onDone, onClose }: { pending: PendingCheckIn; onDone: (ok: PlateOk) => void; onClose: () => void }) {
  const waiting = waitingRewards(pending.state);
  const [choice, setChoice] = useState(waiting[0] ? keyOf(waiting[0]) : "none");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const picked = waiting.find((r) => keyOf(r) === choice) ?? null;

  async function confirm(key: string) {
    setBusy(true);
    setError(null);
    try {
      const position = await getPosition(navigator.geolocation);
      const result = await confirmPendingCheckIn({ data: { choice: choiceOf(key), position } });
      if (result.kind === "ok") {
        onDone(result);
        return;
      }
      setError(plateRefusal(result));
    } catch {
      setError("That didn't save. Check the connection and try again.");
    }
    setBusy(false);
  }

  const heading = asking
    ? "Use your reward now?"
    : pending.checkedInToday
      ? `Checked in today — visit #${pending.nextVisitNumber}`
      : `Hi ${pending.firstName} — this will be visit #${pending.nextVisitNumber}`;
  const buttonLabel = picked ? "Use my reward" : pending.checkedInToday ? "Show my confirmation" : "Check in";

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-[18px] border-canvas-border bg-canvas sm:max-w-[440px]">
        <Eyebrow>{pending.memberName}</Eyebrow>
        <DialogTitle className="font-display text-[22px] font-bold leading-tight text-ink">{heading}</DialogTitle>
        {asking && picked ? (
          <>
            <p className="text-[20px] font-semibold text-ink">{picked.reward}</p>
            <DialogDescription className={leadClass}>This can&rsquo;t be undone without a staff member.</DialogDescription>
            <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => confirm(choice)}>
              {busy ? "Saving…" : "Yes, use it"}
            </button>
            <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => confirm("none")}>
              No, just check in
            </button>
          </>
        ) : (
          <>
            {pending.state.used && <p className={leadClass}>You&rsquo;ve used today&rsquo;s reward here: {pending.state.used.reward}.</p>}
            <RewardChoices waiting={waiting} choice={choice} onChange={setChoice} />
            <button type="button" className={`${primaryButtonClass} min-h-14 text-[17px]`} disabled={busy} onClick={() => (picked ? setAsking(true) : confirm("none"))}>
              {busy ? "Saving…" : buttonLabel}
            </button>
            <DialogDescription className={hintClass}>
              We&rsquo;ll ask for your location to help the taproom spot misuse. You can say no.
            </DialogDescription>
          </>
        )}
        {error && (
          <p role="alert" className={fieldErrorClass}>
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
