import { useState, type FormEvent } from "react";
import { confirmAtPlate, undoAtPlate, type PlateChoice, type PlateResult, type PlateView } from "@/lib/tap-card/plate.server";
import { requestHolderSignIn } from "@/lib/tap-card/holder.server";
import type { BarReward } from "@/lib/tap-card/loyalty";
import { CanvasHeading, fieldErrorClass, inputClass, labelClass, leadClass, primaryButtonClass } from "@/components/public-forms/PublicFormParts";
import { Eyebrow } from "@/components/tap-card/TapCardShell";
import { outcomeMessage, useByDate } from "@/components/tap-card/CheckInScreen";

type Ready = Extract<PlateView, { view: "ready" }>;

function rewardLine(r: BarReward): string {
  return r.kind === "trail" ? `Beer Trail offer: ${r.reward}` : `${r.reward} (use by ${useByDate(r.expiresAt)})`;
}
const keyOf = (r: BarReward) => (r.kind === "trail" ? "trail" : r.id);
const choiceOf = (key: string): PlateChoice => (key === "none" ? { kind: "none" } : key === "trail" ? { kind: "trail" } : { kind: "member", id: key });

function refusal(result: PlateResult): string | null {
  switch (result.kind) {
    case "wrong-code":
      return `That code isn't right. ${result.triesLeft} ${result.triesLeft === 1 ? "try" : "tries"} left.`;
    case "locked":
      return "Too many tries. Ask your bartender to try again in 15 minutes.";
    case "signed-out":
      return "You've been signed out. Reload this page to sign in again.";
    case "closed":
      return "This plate isn't taking check-ins right now. Ask your bartender to tap your card.";
    default:
      return null;
  }
}

function StaffCodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className={`${labelClass} flex flex-col gap-1.5`}>
      Bartender: staff code
      <input
        className={`${inputClass} max-w-[160px] text-center text-[22px] tracking-[0.3em]`}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        pattern="[0-9]{4}"
        required
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
      />
    </label>
  );
}

function ReadyScreen({ view }: { view: Ready }) {
  const waiting = view.state.used ? [] : [view.state.featured, ...view.state.others].filter((r): r is BarReward => r !== null);
  const [choice, setChoice] = useState(waiting[0] ? keyOf(waiting[0]) : "none");
  const [staffCode, setStaffCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<PlateResult, { kind: "ok" }> | null>(null);
  const [undoing, setUndoing] = useState(false);

  async function submit(event: FormEvent, call: () => Promise<PlateResult>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await call();
      if (result.kind === "ok") {
        setDone(result);
        setStaffCode("");
        setUndoing(false);
      } else setError(refusal(result));
    } catch {
      setError("That didn't save. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const { state } = done;
    return (
      <>
        <Eyebrow>{view.memberName}</Eyebrow>
        <CanvasHeading size="md">{state.firstToday ? `✓ Visit #${state.visitNumber} recorded` : `Checked in today — visit #${state.visitNumber}`}</CanvasHeading>
        {[...state.newlyEarned, ...done.milestoneRewards].map((r) => (
          <p key={r} className="text-[15px] text-ink">
            🎉 You just earned: {r}
          </p>
        ))}
        {state.used && <p className="text-[18px] font-semibold text-ink">{state.used.reward} used</p>}
        {outcomeMessage(done.outcome) && <p className={leadClass}>{outcomeMessage(done.outcome)}</p>}
        {done.outcome === "undone" && <p className={leadClass}>Put back on your card.</p>}
        {state.used &&
          (undoing ? (
            <form onSubmit={(e) => submit(e, () => undoAtPlate({ data: { code: view.code, staffCode } }))} className="flex flex-col gap-3">
              <StaffCodeField value={staffCode} onChange={setStaffCode} />
              <button type="submit" className={primaryButtonClass} disabled={busy}>
                Undo
              </button>
            </form>
          ) : (
            <button type="button" className="w-fit text-[14px] font-medium text-brand underline underline-offset-2" onClick={() => setUndoing(true)}>
              Undo (bartender&rsquo;s code)
            </button>
          ))}
        {error && (
          <p role="alert" className={fieldErrorClass}>
            {error}
          </p>
        )}
      </>
    );
  }

  return (
    <form onSubmit={(e) => submit(e, () => confirmAtPlate({ data: { code: view.code, staffCode, choice: choiceOf(choice) } }))} className="flex flex-col gap-4">
      <Eyebrow>{view.memberName}</Eyebrow>
      <CanvasHeading size="md">
        {view.checkedInToday ? `Checked in today — visit #${view.nextVisitNumber}` : `Hi ${view.firstName} — this will be visit #${view.nextVisitNumber}`}
      </CanvasHeading>
      {view.state.used ? (
        <p className={leadClass}>You&rsquo;ve used today&rsquo;s reward here: {view.state.used.reward}.</p>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className={`${labelClass} mb-1`}>Use now:</legend>
          {[...waiting.map((r) => ({ key: keyOf(r), label: rewardLine(r) })), { key: "none", label: "Just check in" }].map((o) => (
            <label key={o.key} className="flex min-h-11 items-center gap-3 rounded-xl border border-canvas-border bg-white px-4 py-2 text-[15px] text-ink">
              <input type="radio" name="choice" value={o.key} checked={choice === o.key} onChange={() => setChoice(o.key)} className="size-5" />
              {o.label}
            </label>
          ))}
        </fieldset>
      )}
      <p className={leadClass}>Show this to your bartender.</p>
      <StaffCodeField value={staffCode} onChange={setStaffCode} />
      <button type="submit" className={primaryButtonClass} disabled={busy}>
        {busy ? "Saving…" : "Confirm"}
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
        <p className={leadClass}>We sent a sign-in link to that email. Open it on this phone.</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <p className={leadClass}>Enter the email you used for your card. We&rsquo;ll send a link that brings you back here.</p>
          <label className={`${labelClass} flex flex-col gap-1.5`}>
            Email
            <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button type="submit" className={primaryButtonClass} disabled={busy}>
            {busy ? "Sending…" : "Send sign-in link"}
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
