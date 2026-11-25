import { useState, type FormEvent } from "react";
import { confirmAtPlate, type PlateView } from "@/lib/tap-card/plate.server";
import { requestHolderSignIn } from "@/lib/tap-card/holder.server";
import { getPosition } from "@/lib/tap-card/get-position";
import { CanvasHeading, cardLinkClass, fieldErrorClass, hintClass, inputClass, labelClass, leadClass, primaryButtonClass, secondaryButtonClass } from "@/components/public-forms/PublicFormParts";
import { Eyebrow } from "@/components/tap-card/TapCardShell";
import { RewardChoices, choiceOf, keyOf, waitingRewards } from "@/components/tap-card/RewardChoices";
import { PlateSuccess, StaffCodeForm, type PlateOk } from "@/components/tap-card/PlateSuccess";
import { SignInCodeForm } from "@/components/tap-card/SignInCodeForm";
import { CardScanner } from "@/components/tap-card/CardScanner";
import { joinPageUrl } from "@/lib/tap-card/trail-join";
import { freeCardUrl } from "@/lib/tap-card/free-card";
import { signedOutButtons, type SignUpChoice } from "@/lib/tap-card/plate";

type Ready = Extract<PlateView, { view: "ready" }>;

/**
 * A pass holder at the counter plate: check-ins are by staff QR (spec
 * 2026-11-24). The 4-digit staff code is the backup.
 */
function ReadyScreen({ view }: { view: Ready }) {
  const waiting = waitingRewards(view.state);
  const [choice, setChoice] = useState(waiting[0] ? keyOf(waiting[0]) : "none");
  const [typing, setTyping] = useState(false);
  const [done, setDone] = useState<PlateOk | null>(null);

  if (done) return <PlateSuccess memberName={view.memberName} memberSlug={view.memberSlug} plateCode={view.code} initial={done} />;

  return (
    <div className="flex flex-col gap-4">
      <Eyebrow>{view.memberName}</Eyebrow>
      <CanvasHeading size="md">
        {view.newPass ? `Your Scan Pass is ready, ${view.firstName}.` : `Hi ${view.firstName}, you already have a Scan Pass.`}
      </CanvasHeading>
      {typing ? (
        <>
          <RewardChoices waiting={waiting} choice={choice} onChange={setChoice} />
          <StaffCodeForm
            label={choice === "none" ? "Check in" : "Use my reward"}
            onSubmit={async (staffCode) => {
              const position = await getPosition(navigator.geolocation);
              const result = await confirmAtPlate({ data: { code: view.code, staffCode, choice: choiceOf(choice), position } });
              if (result.kind === "ok") setDone(result);
              return result;
            }}
          />
          <p className={hintClass}>We&rsquo;ll ask for your location to help the taproom spot misuse. You can say no.</p>
          <button type="button" className="w-fit text-[14px] font-medium text-ink-muted underline underline-offset-2" onClick={() => setTyping(false)}>
            Scan the staff QR code instead
          </button>
        </>
      ) : (
        <>
          <p className={leadClass}>To check in, scan the staff QR code. Ask a staff member for it.</p>
          <CardScanner label="Scan the staff QR code" />
          {waiting.length > 0 && (
            <section className="flex flex-col gap-1 rounded-xl border border-canvas-border bg-white px-4 py-3" aria-label="Waiting for you here">
              <h2 className="text-[14px] font-semibold text-ink">Waiting for you here</h2>
              <ul className="flex flex-col gap-1 text-[15px] text-ink">
                {waiting.map((r) => (
                  <li key={keyOf(r)}>{r.reward}</li>
                ))}
              </ul>
            </section>
          )}
          <button type="button" className="w-fit text-[14px] font-medium text-brand underline underline-offset-2" onClick={() => setTyping(true)}>
            Enter the staff code instead
          </button>
        </>
      )}
      {view.canJoinTrail && (
        <a href={joinPageUrl(view.code)} className={`${cardLinkClass} w-fit text-[14px]`}>
          Join this year&rsquo;s Beer Trail
        </a>
      )}
    </div>
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
  const primaryLabel: Record<SignUpChoice, string> = { "join-trail": "Join the Beer Trail", "free-card": "Get your free Scan Pass" };
  const secondaryLabel: Record<SignUpChoice, string> = { "join-trail": "Join the Beer Trail", "free-card": "Just get the free loyalty pass" };

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
          <CanvasHeading size="md">Welcome to the Inland Scan Pass</CanvasHeading>
          <p className={leadClass}>
            {trailStop
              ? `Collect Beer Trail stops and earn rewards at ${memberName} and every Guild member.`
              : `Earn rewards at ${memberName} and every Guild member. The pass is free.`}
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
            I have a Scan Pass: sign in
          </button>
        </div>
      ) : (
        <CanvasHeading size="md">Sign in to your Scan Pass</CanvasHeading>
      )}
      {!signingIn ? null : sent ? (
        <SignInCodeForm email={email} onSignedIn={() => window.location.reload()} />
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <p className={leadClass}>
            Enter the email you used for your pass. We&rsquo;ll email you a sign-in code. You&rsquo;ll only need to do this once on this
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
          <CanvasHeading size="md">Inland Scan Pass</CanvasHeading>
          <p className={leadClass}>We don&rsquo;t recognize this plate. Ask a staff member for help.</p>
        </>
      );
    case "closed":
      return (
        <>
          <Eyebrow>{view.memberName}</Eyebrow>
          <CanvasHeading size="md">This taproom isn&rsquo;t taking Scan Pass check-ins right now.</CanvasHeading>
        </>
      );
    case "signed-out":
      return <SignedOut code={view.code} memberName={view.memberName} canJoinTrail={view.canJoinTrail} trailStop={view.trailStop} />;
    case "ready":
      return <ReadyScreen view={view} />;
  }
}
