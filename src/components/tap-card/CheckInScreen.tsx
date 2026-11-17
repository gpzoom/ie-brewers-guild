import { useState } from "react";
import { recordCheckIn, type RecordCheckInResult } from "@/lib/tap-card/card-view.server";
import type { CardView } from "@/lib/tap-card/card-view";
import { CanvasHeading, leadClass, primaryButtonClass, secondaryButtonClass } from "@/components/public-forms/PublicFormParts";
import { Eyebrow } from "@/components/tap-card/TapCardShell";

type CheckInView = Extract<CardView, { view: "staff-check-in" }>;

export function shortDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** What the bar sees after a button press -- exact copy from the plan. */
export function resultBanner(result: RecordCheckInResult): string {
  switch (result.kind) {
    case "recorded":
      return result.redeemed ? "Visit recorded — offer redeemed" : "Visit recorded";
    case "already-visited-today":
      return "Already recorded today";
    case "already-redeemed":
      return `Offer already used this year (${shortDate(result.redeemedOn)})`;
    case "not-allowed":
      return "This device can't record visits right now.";
    case "unknown-card":
      return "We don't recognize this card.";
  }
}

/** The bartender's screen for an active card: who it is, the offer, and two buttons. */
export function CheckInScreen({ view }: { view: CheckInView }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RecordCheckInResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const redeemed = result && "redeemed" in result && result.redeemed;
  const offerUsed = !view.redemption.available || redeemed || result?.kind === "already-redeemed";

  async function press(redeem: boolean) {
    setBusy(true);
    setError(null);
    try {
      setResult(await recordCheckIn({ data: { code: view.code, redeem } }));
    } catch {
      setError("That didn't save. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Eyebrow>{view.memberName}</Eyebrow>
      <CanvasHeading size="lg">{view.firstName}</CanvasHeading>
      <div className="flex flex-col gap-1 rounded-xl border border-canvas-border bg-white px-4 py-3.5">
        <span className="text-[13px] text-ink-muted">Your offer</span>
        <span className="text-[17px] font-semibold text-ink">{view.offer}</span>
        {offerUsed ? (
          <span className="mt-1 inline-flex w-fit rounded-full bg-canvas-2 px-3 py-1 text-[13px] text-ink-muted">
            {view.redemption.available ? "Offer used today" : `Offer used ${shortDate(view.redemption.redeemedOn)}`}
          </span>
        ) : (
          <span className="mt-1 inline-flex w-fit rounded-full bg-[#E3F1E4] px-3 py-1 text-[13px] font-semibold text-[#1F5E2A]">
            Nickel offer available
          </span>
        )}
      </div>
      {view.visitedToday && !result && <p className={leadClass}>Already recorded today.</p>}

      {result ? (
        <div role="status" className="flex flex-col gap-2">
          <p className="text-[20px] font-semibold text-ink">{resultBanner(result)}</p>
          {"rewards" in result &&
            result.rewards.map((reward) => (
              <p key={reward} className="text-[15px] text-ink">
                🎉 {view.firstName} just earned: {reward}
              </p>
            ))}
          <p className={leadClass}>Tap the next card to check someone else in.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {!offerUsed && (
            <button type="button" disabled={busy} onClick={() => press(true)} className={`${primaryButtonClass} min-h-14 text-[17px]`}>
              Record visit + redeem offer
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => press(false)} className={`${secondaryButtonClass} min-h-14 text-[17px]`}>
            Record visit
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </>
  );
}
