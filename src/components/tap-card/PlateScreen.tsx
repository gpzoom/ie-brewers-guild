import { useState, type FormEvent } from "react";
import { choosePlateAction, confirmAtPlate, type PlateChoice, type PlateView } from "@/lib/tap-card/plate.server";
import { requestHolderSignIn } from "@/lib/tap-card/holder.server";
import type { BarReward, OfferSlot } from "@/lib/tap-card/loyalty";
import { PENDING_MINUTES } from "@/lib/tap-card/staff-qr";
import { CanvasHeading, cardLinkClass, fieldErrorClass, inputClass, labelClass, leadClass, primaryButtonClass, secondaryButtonClass } from "@/components/public-forms/PublicFormParts";
import { Eyebrow } from "@/components/tap-card/TapCardShell";
import { useByDate } from "@/components/tap-card/CheckInScreen";
import { PlateSuccess, StaffCodeForm, plateRefusal, type PlateOk } from "@/components/tap-card/PlateSuccess";
import { SignInCodeForm } from "@/components/tap-card/SignInCodeForm";
import { CardScanner } from "@/components/tap-card/CardScanner";
import { joinPageUrl } from "@/lib/tap-card/trail-join";
import { freeCardUrl } from "@/lib/tap-card/free-card";
import { signedOutButtons, type SignUpChoice } from "@/lib/tap-card/plate";

type Ready = Extract<PlateView, { view: "ready" }>;

function rewardLine(r: BarReward): string {
  if (r.kind === "trail") return `Use my Beer Trail offer: ${r.reward}`;
  if (r.kind === "earn") return `Use my reward: ${r.reward} (earned with this visit)`;
  return `Use my reward: ${r.reward} (use by ${useByDate(r.expiresAt)})`;
}
const keyOf = (r: BarReward) => (r.kind === "trail" ? "trail" : r.kind === "earn" ? `earn:${r.slot}` : r.id);
const choiceOf = (key: string): PlateChoice =>
  key === "none"
    ? { kind: "none" }
    : key === "trail"
      ? { kind: "trail" }
      : key.startsWith("earn:")
        ? { kind: "earn", slot: key.slice(5) as OfferSlot }
        : { kind: "member", id: key };

/**
 * The customer picks, taps Continue, then scans the staff QR code
 * (spec 2026-11-18 staff QR). The staff code is the backup.
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
        <CanvasHeading size="md">Now scan the staff QR code</CanvasHeading>
        <p className={leadClass}>
          Ask a staff member for the Tap Card QR code they keep behind the counter, and scan it with your camera within {PENDING_MINUTES}{" "}
          minutes.
        </p>
        <p className="rounded-xl border border-canvas-border bg-white px-4 py-3 text-[15px] text-ink">{picked}</p>
        {step === "scan" && <CardScanner label="Scan the staff QR code" />}
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
      {view.canJoinTrail && (
        <a href={joinPageUrl(view.code)} className={`${cardLinkClass} w-fit text-[14px]`}>
          Join this year&rsquo;s Beer Trail
        </a>
      )}
      {error && (
        <p role="alert" className={fieldErrorClass}>
          {error}
        </p>
      )}
    </form>
  );
}

function SignedOut({ code, memberName, canJoinTrail, trailStop }: { code: string; memberName: string; canJoinTrail: boolean; trailStop: boolean }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const buttons = signedOutButtons({ trailStop, canJoinTrail });
  const href = (c: SignUpChoice) => (c === "join-trail" ? joinPageUrl(code) : freeCardUrl(code));
  const primaryLabel: Record<SignUpChoice, string> = { "join-trail": "Join the Beer Trail", "free-card": "Get your free Tap Card" };
  const secondaryLabel: Record<SignUpChoice, string> = { "join-trail": "Join the Beer Trail", "free-card": "Just get the free loyalty card" };

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
      {!signingIn ? (
        <div className="flex flex-col gap-3">
          <CanvasHeading size="md">Welcome to the Inland Tap Card</CanvasHeading>
          <p className={leadClass}>
            {trailStop
              ? `Collect Beer Trail stops and earn rewards at ${memberName} and every Guild member.`
              : `Earn rewards at ${memberName} and every Guild member. The card is free.`}
          </p>
          <a href={href(buttons.primary)} className={primaryButtonClass}>
            {primaryLabel[buttons.primary]}
          </a>
          {buttons.secondary.map((c) => (
            <a key={c} href={href(c)} className={`${cardLinkClass} w-fit text-[15px]`}>
              {secondaryLabel[c]}
            </a>
          ))}
          <button type="button" className={secondaryButtonClass} onClick={() => setSigningIn(true)}>
            I have a Tap Card: sign in
          </button>
        </div>
      ) : (
        <CanvasHeading size="md">Sign in to your Tap Card</CanvasHeading>
      )}
      {!signingIn ? null : sent ? (
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
          <p className={leadClass}>We don&rsquo;t recognize this plate. Ask a staff member to tap your card.</p>
        </>
      );
    case "closed":
      return (
        <>
          <Eyebrow>{view.memberName}</Eyebrow>
          <CanvasHeading size="md">Ask a staff member to tap your card.</CanvasHeading>
        </>
      );
    case "signed-out":
      return <SignedOut code={view.code} memberName={view.memberName} canJoinTrail={view.canJoinTrail} trailStop={view.trailStop} />;
    case "ready":
      return <ReadyScreen view={view} />;
  }
}
