import { useEffect, useRef, useState } from "react";
import { checkInCard, undoCardReward, useCardReward, type BarResult } from "@/lib/tap-card/card-view.server";
import type { CardView } from "@/lib/tap-card/card-view";
import type { BarState } from "@/lib/tap-card/bar-core";
import type { BarReward } from "@/lib/tap-card/loyalty";
import { CanvasHeading, leadClass, primaryButtonClass, secondaryButtonClass } from "@/components/public-forms/PublicFormParts";
import { Eyebrow } from "@/components/tap-card/TapCardShell";

type CheckInView = Extract<CardView, { view: "staff-check-in" }>;
type Outcome = "used" | "already-used-today" | "not-available" | "undone" | "nothing-to-undo";

/** A Pacific calendar day ("2026-12-31") as "Dec 31". */
export function shortDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** An expiry moment as its Pacific date ("Jun 30"). */
export function useByDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
}

export function barHeading(state: Pick<BarState, "visitNumber" | "firstToday">, firstName: string): string {
  return state.firstToday
    ? `✓ Visit #${state.visitNumber} recorded — ${firstName}`
    : `Already checked in today — visit #${state.visitNumber} — ${firstName}`;
}

export function outcomeMessage(outcome: Outcome | undefined): string | null {
  if (outcome === "already-used-today") return "One reward per visit — already used today.";
  if (outcome === "not-available") return "That reward isn't available any more.";
  return null;
}

function RewardText({ reward }: { reward: BarReward }) {
  if (reward.kind === "trail") {
    return (
      <>
        <span className="text-[13px] text-ink-muted">Beer Trail offer</span>
        <span className="text-[18px] font-semibold text-ink">{reward.reward}</span>
      </>
    );
  }
  return (
    <>
      <span className="text-[18px] font-semibold text-ink">{reward.reward}</span>
      {reward.terms && <span className="text-[13px] text-ink-muted">{reward.terms}</span>}
      {reward.kind === "member" && <span className="text-[13px] text-ink-muted">Use by {useByDate(reward.expiresAt)}</span>}
    </>
  );
}

const choiceOf = (r: BarReward) =>
  r.kind === "trail" ? { kind: "trail" as const } : r.kind === "earn" ? { kind: "earn" as const, slot: r.slot } : { kind: "member" as const, id: r.id };

/** The staff member's screen for an active card: opening it records the visit; at most one button press after that. */
export function CheckInScreen({ view }: { view: CheckInView }) {
  const [result, setResult] = useState<BarResult | null>(null);
  const [milestones, setMilestones] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const started = useRef(false);

  async function send(call: () => Promise<BarResult>) {
    setBusy(true);
    setError(null);
    try {
      const next = await call();
      setResult(next);
      if (next.kind === "ok" && next.milestoneRewards.length > 0) setMilestones(next.milestoneRewards);
    } catch {
      setError("That didn't save. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send(() => checkInCard({ data: { code: view.code } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.code]);

  const header = (
    <>
      <Eyebrow>{view.memberName}</Eyebrow>
    </>
  );

  if (!result) {
    return (
      <>
        {header}
        <CanvasHeading size="md">{error ? view.firstName : "Checking in…"}</CanvasHeading>
        {error && (
          <>
            <p role="alert" className="text-[15px] text-danger">
              {error}
            </p>
            <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => send(() => checkInCard({ data: { code: view.code } }))}>
              Try again
            </button>
          </>
        )}
      </>
    );
  }

  if (result.kind !== "ok") {
    return (
      <>
        {header}
        <CanvasHeading size="md">
          {result.kind === "not-allowed" ? "This device can’t record visits right now." : "We don’t recognize this card."}
        </CanvasHeading>
      </>
    );
  }

  const { state } = result;
  const message = outcomeMessage(result.outcome);
  const celebrations = [...state.newlyEarned, ...milestones];

  return (
    <>
      {header}
      <CanvasHeading size="md">{barHeading(state, view.firstName)}</CanvasHeading>
      {celebrations.map((reward) => (
        <p key={reward} className="text-[15px] text-ink">
          🎉 {view.firstName} just earned: {reward}
        </p>
      ))}

      {state.used ? (
        <div role="status" className="flex flex-col gap-1 rounded-xl border border-canvas-border bg-white px-4 py-3.5">
          <span className="text-[13px] text-ink-muted">Used today</span>
          <RewardText reward={state.used} />
          <button
            type="button"
            className={`${secondaryButtonClass} mt-2 min-h-12`}
            disabled={busy}
            onClick={() => send(() => undoCardReward({ data: { code: view.code } }))}
          >
            Undo
          </button>
        </div>
      ) : state.featured ? (
        <div className="flex flex-col gap-1 rounded-xl border border-canvas-border bg-white px-4 py-3.5">
          <RewardText reward={state.featured} />
          <button
            type="button"
            className={`${primaryButtonClass} mt-2 min-h-14 text-[17px]`}
            disabled={busy}
            onClick={() => send(() => useCardReward({ data: { code: view.code, choice: choiceOf(state.featured!) } }))}
          >
            Use it
          </button>
        </div>
      ) : (
        <p className={leadClass}>Nothing waiting today.</p>
      )}

      {!state.used && state.others.length > 0 && (
        <div className="flex flex-col gap-2">
          <button type="button" className="w-fit text-[14px] font-medium text-brand underline underline-offset-2" onClick={() => setShowOthers(!showOthers)}>
            {state.others.length} more waiting
          </button>
          {showOthers &&
            state.others.map((r) => (
              <div key={r.kind === "trail" ? "trail" : r.kind === "earn" ? `earn:${r.slot}` : r.id} className="flex flex-col gap-1 rounded-xl border border-canvas-border bg-white px-4 py-3">
                <RewardText reward={r} />
                <button
                  type="button"
                  className={`${secondaryButtonClass} mt-1 min-h-11`}
                  disabled={busy}
                  onClick={() => send(() => useCardReward({ data: { code: view.code, choice: choiceOf(r) } }))}
                >
                  Use this instead
                </button>
              </div>
            ))}
        </div>
      )}

      {message && (
        <p role="status" className="text-[15px] text-ink">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
      <p className={leadClass}>Tap the next card to check someone else in.</p>
    </>
  );
}
