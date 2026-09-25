import { useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { stopImpersonation } from "@/lib/guild/impersonation.server";
import { MEMBER_TYPE_SHORT_LABEL } from "@/lib/members/member-type-options";
import {
  canSkipStep,
  isFinishStep,
  nextStep,
  previousStep,
  stepPosition,
  SETUP_STEP_LABELS,
  type SetupStepName,
} from "@/lib/portal/wizard-steps";
import { useMemberEditing } from "@/components/admin/MemberEditingContext";
import { StatusBand, bandButtonClass } from "@/components/shell/AppChrome";
import { useWizardNavigation } from "@/components/portal/setup/useWizardNavigation";
import { cn } from "@/lib/utils";

export const wizardPrimaryButtonClass =
  "inline-flex h-[46px] min-w-0 flex-1 items-center justify-center rounded-[9px] bg-brand px-5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:bg-canvas-border disabled:text-ink-subtle";
export const wizardSecondaryButtonClass =
  "inline-flex h-[46px] shrink-0 basis-[110px] items-center justify-center rounded-[9px] border border-canvas-border bg-white px-4 text-[15px] text-ink transition-colors hover:bg-canvas-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60";

/** The canvas-2 info box with an (i), as in the artboards and StepAnatomy's skip note. */
export function WizardInfoBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-[12px] bg-canvas-2 px-[14px] py-3 text-[13px] leading-[1.45] text-ink-muted">
      <svg
        width="17"
        height="17"
        viewBox="0 0 16 16"
        fill="none"
        className="mt-px shrink-0"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 7.2v4M8 4.9v.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div className="min-w-0 flex-1 text-pretty">{children}</div>
    </div>
  );
}

/**
 * One wizard step's chrome (docs/design/onboarding/StepAnatomy.dc.html for
 * structure; the artboards' design language for look): a near-black top
 * bar with "SET UP YOUR PROFILE", the business name and Save & exit; the
 * "Step N of M" progress line; the step's heading and content; then a
 * white bottom bar with Back / Continue and, on optional steps, Skip for
 * now. Phone-first (390px), a centered ~720px column on a desktop.
 *
 * The content is the portal section's own editor, unchanged -- this only
 * wraps it (spec: "Each wizard step is the portal section with the same
 * content, wrapped in step chrome").
 *
 * Continue and Skip both move on to the next step once pending saves
 * settle; the difference is only in what the member means -- a skipped
 * step stores nothing new. A step with its own Continue (Confirm type,
 * The basics, the finish screens) passes `onContinue`.
 */
export function WizardStep({
  step,
  title,
  lede,
  children,
  skipNote,
  onContinue,
  continueLabel = "Continue",
  continueDisabled = false,
  hideContinue = false,
  backTo,
  error = null,
}: {
  step: SetupStepName;
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
  /** What skipping means, shown above the buttons (StepAnatomy's "Not ready? Skip it." box). */
  skipNote?: ReactNode;
  /** Replaces the default "move to the next step". Return false to stay put. */
  onContinue?: () => Promise<boolean | void>;
  continueLabel?: string;
  continueDisabled?: boolean;
  /** For steps whose own content holds the primary action (Confirm type). */
  hideContinue?: boolean;
  /**
   * Where Back goes: the previous step by default; null hides it (e.g. the
   * first step after The basics once setup is complete -- steps 1-3 are
   * closed by then).
   */
  backTo?: SetupStepName | null;
  error?: string | null;
}) {
  const editing = useMemberEditing();
  const router = useRouter();
  const { goTo, exit } = useWizardNavigation();
  const [busy, setBusy] = useState<null | "continue" | "back" | "skip" | "exit">(null);
  const [navError, setNavError] = useState<string | null>(null);

  const memberType = editing?.memberType ?? "producer";
  const position = stepPosition(step, memberType);
  const back = backTo === undefined ? previousStep(step, memberType) : backTo;
  const next = nextStep(step, memberType);
  const skippable = canSkipStep(step) && next !== null;
  const progress = position ? position.number / position.total : 1;

  async function run(kind: "continue" | "back" | "skip" | "exit", action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(kind);
    setNavError(null);
    try {
      await action();
    } catch (err) {
      setNavError(err instanceof Error ? err.message : "Something went wrong — try again.");
    } finally {
      setBusy(null);
    }
  }

  function handleContinue() {
    void run("continue", async () => {
      if (onContinue) {
        await onContinue();
        return;
      }
      if (next) await goTo(next);
    });
  }

  async function handleStopImpersonating() {
    await stopImpersonation();
    await router.navigate({ to: "/guild/roster" });
  }

  const shownError = error ?? navError;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      {editing?.isImpersonating && (
        <StatusBand
          message={
            <>
              You are editing as {editing.memberName ?? "this member"}. Changes are saved to their
              draft and go live when you publish.
            </>
          }
          actions={
            <button type="button" onClick={handleStopImpersonating} className={bandButtonClass}>
              Stop
            </button>
          }
        />
      )}

      <div className="sticky top-0 z-20 bg-bg">
        <div className="mx-auto flex h-14 w-full max-w-[720px] items-center justify-between gap-3 px-4 md:px-5">
          <div className="flex min-w-0 flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-text-muted">
              Set up your profile
            </span>
            {editing?.memberName && (
              <span className="truncate text-[13px] text-canvas">{editing.memberName}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void run("exit", exit)}
            disabled={busy !== null}
            className="flex min-h-11 shrink-0 items-center px-1 text-[14px] text-brand-bright hover:text-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright disabled:opacity-60"
          >
            {busy === "exit" ? "Saving…" : "Save & exit"}
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[720px] px-5 pt-4 md:px-5 md:pt-6">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between gap-3 text-[13px] text-ink-muted">
            <span>
              {position
                ? `Step ${position.number} of ${position.total}`
                : isFinishStep(step)
                  ? SETUP_STEP_LABELS[step]
                  : ""}
            </span>
            <span>{MEMBER_TYPE_SHORT_LABEL[memberType]}</span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-canvas-2"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <div className="h-1.5 bg-brand" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-[14px] px-5 pb-8 pt-[22px] md:gap-5 md:px-5 md:pt-8">
        <div className="flex flex-col gap-[14px]">
          <h1 className="font-display text-[27px] font-bold leading-[1.15] text-ink md:text-[30px]">
            {title}
          </h1>
          {lede && (
            <div className="text-pretty text-[14px] leading-[1.45] text-ink-muted md:text-[15px]">
              {lede}
            </div>
          )}
        </div>
        {children && <div className="flex flex-col gap-6 pt-1">{children}</div>}
        {skipNote && skippable && <WizardInfoBox>{skipNote}</WizardInfoBox>}
      </div>

      <div className="sticky bottom-0 z-20 border-t border-canvas-border bg-white">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-2 px-4 pb-[18px] pt-3 md:px-5">
          {shownError && (
            <p role="alert" className="text-[13px] text-danger">
              {shownError}
            </p>
          )}
          <div className="flex gap-2.5">
            {back && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run("back", () => goTo(back))}
                className={wizardSecondaryButtonClass}
              >
                Back
              </button>
            )}
            {!hideContinue && (
              <button
                type="button"
                disabled={busy !== null || continueDisabled}
                onClick={handleContinue}
                className={wizardPrimaryButtonClass}
              >
                {busy === "continue" ? "Saving…" : continueLabel}
              </button>
            )}
          </div>
          {skippable && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void run("skip", () => goTo(next!))}
              className={cn(
                "flex min-h-11 items-center justify-center text-[14px] text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-60",
              )}
            >
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
