import { useState, type FormEvent } from "react";
import { choosePlateAction, confirmAtPlate, type PlateChoice, type PlateView } from "@/lib/tap-card/plate.server";
import { requestHolderSignIn } from "@/lib/tap-card/holder.server";
import type { BarReward } from "@/lib/tap-card/loyalty";
import { PENDING_MINUTES } from "@/lib/tap-card/staff-qr";
import { CanvasHeading, fieldErrorClass, inputClass, labelClass, leadClass, primaryButtonClass } from "@/components/public-forms/PublicFormParts";
import { Eyebrow } from "@/components/tap-card/TapCardShell";
import { useByDate } from "@/components/tap-card/CheckInScreen";
import { PlateSuccess, StaffCodeForm, plateRefusal, type PlateOk } from "@/components/tap-card/PlateSuccess";
import { SignInCodeForm } from "@/components/tap-card/SignInCodeForm";
import { CardScanner } from "@/components/tap-card/CardScanner";

type Ready = Extract<PlateView, { view: "ready" }>;

function rewardLine(r: BarReward): string {
  return r.kind === "trail" ? `Use my Beer Trail offer: ${r.reward}` : `Use my reward: ${r.reward} (use by ${useByDate(r.expiresAt)})`;
}
const keyOf = (r: BarReward) => (r.kind === "trail" ? "trail" : r.id);
const choiceOf = (key: string): PlateChoice => (key === "none" ? { kind: "none" } : key === "trail" ? { kind: "trail" } : { kind: "member", id: key });

/**
 * The customer picks, taps Continue, then scans the bartender's QR code
 * (spec 2026-11-18 bartender QR). The staff code is the backup.
 */
function ReadyScreen({ view }: { view: Ready }) {
  const waiting = view.state.used ? [] : [view.state.featured, ...view.state.others].filter((r): r is BarReward => r !== null);
  const [choice, setChoice] = useState(waiting[0] ? keyOf(waiting[0]) : "none");
  const [step, setStep] = useState<"choose" | "scan" | "code">("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<PlateOk | null>(null);

  async function onContinue(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await choosePlateAction({ data: { code: view.code, choice: choiceOf(choice) } });
      if (result.kind === "ok") setStep("scan");
      else setError(plateRefusal(result));
    } catch {
      setError("That didn't work. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <PlateSuccess memberName={view.memberName} memberSlug={view.memberSlug} plateCode={view.code} initial={done} />;

  const picked = choice === "none" ? "Just check in" : rewardLine(waiting.find((r) => keyOf(r) === choice)!);

  if (step === "scan" || step === "code") {
    return (
      <div className="flex flex-col gap-4">
        <Eyebrow>{view.memberName}</Eyebrow>
        <CanvasHeading size="md">Now scan the bartender&rsquo;s QR code</CanvasHeading>
        <p className={leadClass}>
          Ask your bartender for the Tap Card QR code they keep behind the counter, and scan it with your camera within {PENDING_MINUTES}{" "}
          minutes.
        </p>
        <p className="rounded-xl border border-canvas-border bg-white px-4 py-3 text-[15px] text-ink">{picked}</p>
        {step === "scan" && <CardScanner label="Scan the bartender's QR code" />}
        {step === "code" ? (
          <StaffCodeForm
            label="Confirm"
            onSubmit={async (staffCode) => {
              const result = await confirmAtPlate({ data: { code: view.code, staffCode, choice: choiceOf(choice) } });
              if (result.kind === "ok") setDone(result);
              return result;
            }}
          />
        ) : (
          <button type="button" className="w-fit text-[14px] font-medium text-brand underline underline-offset-2" onClick={() => setStep("code")}>
            Enter the staff code instead
          </button>
        )}
        <button type="button" className="w-fit text-[14px] font-medium text-ink-muted underline underline-offset-2" onClick={() => setStep("choose")}>
          Change my choice
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onContinue} className="flex flex-col gap-4">
      <Eyebrow>{view.memberName}</Eyebrow>
      <CanvasHeading size="md">
        {view.checkedInToday ? `Checked in today — visit #${view.nextVisitNumber}` : `Hi ${view.firstName} — this will be visit #${view.nextVisitNumber}`}
      </CanvasHeading>
      {view.state.used ? (
        <p className={leadClass}>You&rsquo;ve used today&rsquo;s reward here: {view.state.used.reward}.</p>
      ) : (
        waiting.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className={`${labelClass} mb-1`}>Choose one:</legend>
            {[...waiting.map((r) => ({ key: keyOf(r), label: rewardLine(r) })), { key: "none", label: "Just check in" }].map((o) => (
              <label key={o.key} className="flex min-h-11 items-center gap-3 rounded-xl border border-canvas-border bg-white px-4 py-2 text-[15px] text-ink">
                <input type="radio" name="choice" value={o.key} checked={choice === o.key} onChange={() => setChoice(o.key)} className="size-5" />
                {o.label}
              </label>
            ))}
          </fieldset>
        )
      )}
      <button type="submit" className={primaryButtonClass} disabled={busy}>
        {busy ? "One moment…" : waiting.length > 0 ? "Continue" : "Check in"}
      </button>
      {error && (
        <p role="alert" className={fieldErrorClass}>
          {error}
        </p>
      )}
    </form>
  );
}

function SignedOut({ code, memberName }: { code: string; memberName: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await requestHolderSignIn({ data: { email, website: "", next: `/t/${code}` } });
      if (result.kind === "check-email") setSent(true);
      else setError(result.message);
    } catch {
      setError("That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Eyebrow>{memberName}</Eyebrow>
      <CanvasHeading size="md">Sign in to your Tap Card</CanvasHeading>
      {sent ? (
        <SignInCodeForm email={email} onSignedIn={() => window.location.reload()} />
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <p className={leadClass}>
            Enter the email you used for your card. We&rsquo;ll email you a sign-in code. You&rsquo;ll only need to do this once on this
            phone.
          </p>
          <label className={`${labelClass} flex flex-col gap-1.5`}>
            Email
            <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button type="submit" className={primaryButtonClass} disabled={busy}>
            {busy ? "Sending…" : "Email me a code"}
          </button>
          {error && (
            <p role="alert" className={fieldErrorClass}>
              {error}
            </p>
          )}
        </form>
      )}
    </>
  );
}

/** /t/<code>: a brewery's counter plate, on the customer's own phone. */
export function PlateScreen({ view }: { view: PlateView }) {
  switch (view.view) {
    case "unknown":
      return (
        <>
          <CanvasHeading size="md">Inland Tap Card</CanvasHeading>
          <p className={leadClass}>We don&rsquo;t recognize this plate. Ask your bartender to tap your card.</p>
        </>
      );
    case "closed":
      return (
        <>
          <Eyebrow>{view.memberName}</Eyebrow>
          <CanvasHeading size="md">Ask your bartender to tap your card.</CanvasHeading>
        </>
      );
    case "signed-out":
      return <SignedOut code={view.code} memberName={view.memberName} />;
    case "ready":
      return <ReadyScreen view={view} />;
  }
}
